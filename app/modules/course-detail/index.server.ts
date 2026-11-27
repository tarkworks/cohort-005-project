import { db } from "~/db";
import {
  calculateProgress,
  findRating,
  getCourseRatingSummary,
  getCourseWithDetails,
  getLessonCountForCourse,
  getLessonProgressForCourse,
  getNextIncompleteLesson,
  rateCourse,
  type Db,
} from "./lib/course-detail";

export type { CourseRatingSummary } from "./lib/course-detail";

/**
 * What the course detail page reads and writes, bound to a database. The app
 * uses `courseDetail`, which reads the app database; tests build their own
 * against a test database.
 */
export function createCourseDetail(database: Db) {
  return {
    /** The course with its Instructor, category, modules and lessons. */
    getCourseWithDetails(courseId: number) {
      return getCourseWithDetails(database, courseId);
    },
    getLessonCount(courseId: number) {
      return getLessonCountForCourse(database, courseId);
    },
    /** Percent of lessons complete, optionally weighted by duration. */
    calculateProgress(
      userId: number,
      courseId: number,
      weightByDuration: boolean
    ) {
      return calculateProgress(database, {
        userId,
        courseId,
        weightByDuration,
      });
    },
    getLessonProgress(userId: number, courseId: number) {
      return getLessonProgressForCourse(database, userId, courseId);
    },
    /** The first lesson, in course order, the Student hasn't completed. */
    getNextIncompleteLesson(userId: number, courseId: number) {
      return getNextIncompleteLesson(database, userId, courseId);
    },
    findRating(userId: number, courseId: number) {
      return findRating(database, userId, courseId);
    },
    getRatingSummary(courseId: number) {
      return getCourseRatingSummary(database, courseId);
    },
    /** Creates or replaces the Student's rating. Throws on a bad rating. */
    rateCourse(userId: number, courseId: number, rating: number) {
      return rateCourse(database, { userId, courseId, rating });
    },
  };
}

// Pure so a route importing this only for its loader doesn't pull the
// database into the client bundle (see `~/db`).
export const courseDetail = /* @__PURE__ */ createCourseDetail(db);
