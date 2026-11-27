import { and, eq, isNull, notExists } from "drizzle-orm";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import * as schema from "~/db/schema";
import { coupons, purchases, refunds, RefundStatus } from "~/db/schema";

export type Db = BetterSQLite3Database<typeof schema>;

/**
 * What the course page offers someone with no Enrollment.
 * - buy: the normal "Enroll Now" checkout.
 * - claim-own-seat: they already paid for a Team Licence with a Seat they can
 *   claim, so buying again would charge them twice for the same course.
 */
export type EnrollOffer = { kind: "buy" } | { kind: "claim-own-seat" };

export function getEnrollOffer(
  db: Db,
  personId: number | null,
  courseId: number
): EnrollOffer {
  if (personId === null) return { kind: "buy" };
  return hasClaimableOwnSeat(db, personId, courseId)
    ? { kind: "claim-own-seat" }
    : { kind: "buy" };
}

// Mirrors getSeatAvailability's "available" in one query: unclaimed, not
// refunded, and not on hold behind an Open Refund Request (ADR-0003).
function hasClaimableOwnSeat(db: Db, personId: number, courseId: number) {
  return !!db
    .select({ id: coupons.id })
    .from(coupons)
    .innerJoin(purchases, eq(coupons.purchaseId, purchases.id))
    .where(
      and(
        eq(purchases.userId, personId),
        eq(coupons.courseId, courseId),
        isNull(coupons.redeemedByUserId),
        isNull(coupons.refundedAt),
        notExists(
          db
            .select({ id: refunds.id })
            .from(refunds)
            .where(
              and(
                eq(refunds.purchaseId, purchases.id),
                eq(refunds.status, RefundStatus.Open)
              )
            )
        )
      )
    )
    .get();
}
