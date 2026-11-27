import { beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { createTestDb, seedBaseData, type TestDb } from "~/test/setup";
import * as schema from "~/db/schema";
import { RefundStatus } from "~/db/schema";
import { createEnrollOffer } from "../index.server";

let db: TestDb;
let buyer: typeof schema.users.$inferSelect;
let teammate: typeof schema.users.$inferSelect;
let course: typeof schema.courses.$inferSelect;
let otherCourse: typeof schema.courses.$inferSelect;
let offer: ReturnType<typeof createEnrollOffer>;

beforeEach(() => {
  db = createTestDb();
  const base = seedBaseData(db);
  buyer = base.user;
  course = base.course;
  teammate = db
    .insert(schema.users)
    .values({
      name: "Tia Mate",
      email: "tia@example.com",
      role: schema.UserRole.Student,
    })
    .returning()
    .get();
  otherCourse = db
    .insert(schema.courses)
    .values({
      title: "Other Course",
      slug: "other-course",
      description: "Another course",
      salesCopy: course.salesCopy,
      instructorId: base.instructor.id,
      categoryId: base.category.id,
      status: schema.CourseStatus.Published,
    })
    .returning()
    .get();
  offer = createEnrollOffer(db);
});

// ─── Fixtures ───
// Team Licences are bought inside the purchase route, so no service writes
// these rows yet; they go in directly, in one place.

function buyTeamLicence(buyerId: number, courseId: number, seats: number) {
  const purchase = db
    .insert(schema.purchases)
    .values({ userId: buyerId, courseId, amountPaid: 1000 * seats })
    .returning()
    .get();
  const team = db.insert(schema.teams).values({}).returning().get();
  const coupons = Array.from({ length: seats }, (_, i) =>
    db
      .insert(schema.coupons)
      .values({
        teamId: team.id,
        courseId,
        purchaseId: purchase.id,
        code: `code-${purchase.id}-${i}`,
      })
      .returning()
      .get()
  );
  return { purchase, coupons };
}

function buyForMyself(buyerId: number, courseId: number) {
  return db
    .insert(schema.purchases)
    .values({ userId: buyerId, courseId, amountPaid: 1000 })
    .returning()
    .get();
}

function claim(couponId: number, userId: number) {
  db.update(schema.coupons)
    .set({ redeemedByUserId: userId, redeemedAt: new Date().toISOString() })
    .where(eq(schema.coupons.id, couponId))
    .run();
}

function refundSeat(couponId: number) {
  db.update(schema.coupons)
    .set({ refundedAt: new Date().toISOString() })
    .where(eq(schema.coupons.id, couponId))
    .run();
}

function requestRefund(purchaseId: number, status: RefundStatus) {
  db.insert(schema.refunds)
    .values({
      purchaseId,
      status,
      reason: "Changed my mind",
      requestedAt: new Date().toISOString(),
    })
    .run();
}

// ─── Behaviour ───

describe("getEnrollOffer", () => {
  it("offers the checkout to a signed-out visitor", () => {
    expect(offer.getEnrollOffer(null, course.id)).toEqual({ kind: "buy" });
  });

  it("offers the checkout to a Student who has bought nothing", () => {
    expect(offer.getEnrollOffer(buyer.id, course.id)).toEqual({ kind: "buy" });
  });

  it("points a Team Licence buyer at the Seat they already paid for", () => {
    buyTeamLicence(buyer.id, course.id, 2);

    expect(offer.getEnrollOffer(buyer.id, course.id)).toEqual({
      kind: "claim-own-seat",
    });
  });

  it("still offers the checkout to someone else on the course", () => {
    buyTeamLicence(buyer.id, course.id, 2);

    expect(offer.getEnrollOffer(teammate.id, course.id)).toEqual({
      kind: "buy",
    });
  });

  it("only counts a Team Licence for this course", () => {
    buyTeamLicence(buyer.id, otherCourse.id, 2);

    expect(offer.getEnrollOffer(buyer.id, course.id)).toEqual({ kind: "buy" });
  });

  it("offers the checkout once every Seat is claimed", () => {
    const { coupons } = buyTeamLicence(buyer.id, course.id, 1);
    claim(coupons[0].id, teammate.id);

    expect(offer.getEnrollOffer(buyer.id, course.id)).toEqual({ kind: "buy" });
  });

  it("points at the Seat while any one is still unclaimed", () => {
    const { coupons } = buyTeamLicence(buyer.id, course.id, 2);
    claim(coupons[0].id, teammate.id);

    expect(offer.getEnrollOffer(buyer.id, course.id)).toEqual({
      kind: "claim-own-seat",
    });
  });

  it("offers the checkout when the Team Licence was refunded", () => {
    const { purchase, coupons } = buyTeamLicence(buyer.id, course.id, 1);
    requestRefund(purchase.id, RefundStatus.Approved);
    refundSeat(coupons[0].id);

    expect(offer.getEnrollOffer(buyer.id, course.id)).toEqual({ kind: "buy" });
  });

  it("offers the checkout while the Seats are on hold behind an Open Refund Request", () => {
    const { purchase } = buyTeamLicence(buyer.id, course.id, 1);
    requestRefund(purchase.id, RefundStatus.Open);

    expect(offer.getEnrollOffer(buyer.id, course.id)).toEqual({ kind: "buy" });
  });

  it("points at the Seat again once a Refund Request is declined", () => {
    const { purchase } = buyTeamLicence(buyer.id, course.id, 1);
    requestRefund(purchase.id, RefundStatus.Declined);

    expect(offer.getEnrollOffer(buyer.id, course.id)).toEqual({
      kind: "claim-own-seat",
    });
  });

  it("does not count an Individual Purchase as a Seat", () => {
    buyForMyself(buyer.id, course.id);

    expect(offer.getEnrollOffer(buyer.id, course.id)).toEqual({ kind: "buy" });
  });
});
