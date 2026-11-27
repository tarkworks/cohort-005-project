import { db } from "~/db";
import { getEnrollOffer, type Db } from "./lib/enroll-offer";

export type { EnrollOffer } from "./lib/enroll-offer";

/**
 * The enroll offer bound to a database. The app uses `enrollOffer`, which
 * reads the app database; tests build their own against a test database.
 */
export function createEnrollOffer(database: Db) {
  return {
    /**
     * What the course page should offer a Person (or nobody) who has no
     * Enrollment: the checkout, or a pointer to a Seat they already paid for.
     */
    getEnrollOffer(personId: number | null, courseId: number) {
      return getEnrollOffer(database, personId, courseId);
    },
  };
}

// Pure so a route importing this only for its loader doesn't pull the
// database into the client bundle (see `~/db`).
export const enrollOffer = /* @__PURE__ */ createEnrollOffer(db);
