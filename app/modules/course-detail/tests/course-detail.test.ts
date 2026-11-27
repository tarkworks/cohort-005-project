import { beforeEach, describe, expect, it } from "vitest";
import { createTestDb, seedBaseData, type TestDb } from "~/test/setup";
import * as schema from "~/db/schema";
import { LessonProgressStatus } from "~/db/schema";
import { createCourseDetail } from "../index.server";

let db: TestDb;
let student: typeof schema.users.$inferSelect;
let course: typeof schema.courses.$inferSelect;
let detail: ReturnType<typeof createCourseDetail>;

beforeEach(() => {
  db = createTestDb();
  const base = seedBaseData(db);
  student = base.user;
  course = base.course;
  detail = createCourseDetail(db);
});

// ─── Fixtures ───
// Course content is written by the instructor routes, not a module, so rows
// go in directly, in one place.

function addModule(title: string, position: number) {
  return db
    .insert(schema.modules)
    .values({ courseId: course.id, title, position })
    .returning()
    .get();
}

function addLesson(
  moduleId: number,
  title: string,
  { position = 1, durationMinutes = 10 } = {}
) {
  return db
    .insert(schema.lessons)
    .values({ moduleId, title, position, durationMinutes })
    .returning()
    .get();
}

function record(
  lessonId: number,
  status = LessonProgressStatus.Completed,
  userId = student.id
) {
  db.insert(schema.lessonProgress).values({ userId, lessonId, status }).run();
}

function complete(lessonId: number) {
  record(lessonId);
}

function addOtherCourse() {
  const other = db
    .insert(schema.courses)
    .values({
      title: "Other Course",
      slug: "other-course",
      description: "Another course",
      salesCopy: course.salesCopy,
      instructorId: course.instructorId,
      categoryId: course.categoryId,
      status: schema.CourseStatus.Published,
    })
    .returning()
    .get();
  const mod = db
    .insert(schema.modules)
    .values({ courseId: other.id, title: "Elsewhere", position: 1 })
    .returning()
    .get();
  const lesson = addLesson(mod.id, "Elsewhere lesson");
  complete(lesson.id);
  return other;
}

function addStudent(name: string) {
  return db
    .insert(schema.users)
    .values({
      name,
      email: `${name.toLowerCase()}@example.com`,
      role: schema.UserRole.Student,
    })
    .returning()
    .get();
}

function buildCourse() {
  const second = addModule("Second", 2);
  const first = addModule("First", 1);
  const b = addLesson(first.id, "B", { position: 2 });
  const a = addLesson(first.id, "A", { position: 1 });
  const c = addLesson(second.id, "C", { position: 1 });
  return { a, b, c };
}

// ─── Behaviour ───

describe("getCourseWithDetails", () => {
  it("gives null for a course that doesn't exist", () => {
    expect(detail.getCourseWithDetails(9999)).toBeNull();
  });

  it("gives modules and lessons in position order", () => {
    buildCourse();
    const found = detail.getCourseWithDetails(course.id);

    expect(found?.instructorName).toBe("Test Instructor");
    expect(found?.categoryName).toBe("Programming");
    expect(
      found?.modules.map((m) => [m.title, m.lessons.map((l) => l.title)])
    ).toEqual([
      ["First", ["A", "B"]],
      ["Second", ["C"]],
    ]);
  });
});

describe("progress", () => {
  it("counts no lessons and no progress on an empty course", () => {
    expect(detail.getLessonCount(course.id)).toBe(0);
    expect(detail.calculateProgress(student.id, course.id, false)).toBe(0);
    expect(detail.getNextIncompleteLesson(student.id, course.id)).toBeNull();
  });

  it("works out progress and the next lesson from completed lessons", () => {
    const { a, b, c } = buildCourse();
    complete(a.id);

    expect(detail.getLessonCount(course.id)).toBe(3);
    expect(detail.calculateProgress(student.id, course.id, false)).toBe(33);
    expect(detail.calculateProgress(student.id, course.id, true)).toBe(33);
    expect(detail.getNextIncompleteLesson(student.id, course.id)?.id).toBe(
      b.id
    );
    expect(
      detail.getLessonProgress(student.id, course.id).map((p) => p.lessonId)
    ).toEqual([a.id]);

    complete(b.id);
    complete(c.id);
    expect(detail.calculateProgress(student.id, course.id, false)).toBe(100);
    expect(detail.getNextIncompleteLesson(student.id, course.id)).toBeNull();
  });
});

describe("progress across courses and Students", () => {
  it("ignores lessons and progress from another course", () => {
    const { a } = buildCourse();
    addOtherCourse();
    complete(a.id);

    expect(detail.getLessonCount(course.id)).toBe(3);
    expect(detail.calculateProgress(student.id, course.id, false)).toBe(33);
    expect(detail.calculateProgress(student.id, course.id, true)).toBe(33);
    expect(
      detail.getLessonProgress(student.id, course.id).map((p) => p.lessonId)
    ).toEqual([a.id]);
    expect(detail.getCourseWithDetails(course.id)?.modules).toHaveLength(2);
  });

  it("ignores another Student's progress", () => {
    const { a } = buildCourse();
    record(a.id, LessonProgressStatus.Completed, addStudent("Other").id);

    expect(detail.calculateProgress(student.id, course.id, false)).toBe(0);
    expect(detail.calculateProgress(student.id, course.id, true)).toBe(0);
    expect(detail.getLessonProgress(student.id, course.id)).toEqual([]);
    expect(detail.getNextIncompleteLesson(student.id, course.id)?.id).toBe(
      a.id
    );
  });

  it("weights progress by lesson length when asked", () => {
    const mod = addModule("Only", 1);
    const long = addLesson(mod.id, "Long", { durationMinutes: 30 });
    addLesson(mod.id, "Short", { position: 2, durationMinutes: 10 });
    complete(long.id);

    expect(detail.calculateProgress(student.id, course.id, false)).toBe(50);
    expect(detail.calculateProgress(student.id, course.id, true)).toBe(75);
  });

  it("does not count a lesson in progress as complete", () => {
    const { a, b } = buildCourse();
    complete(a.id);
    record(b.id, LessonProgressStatus.InProgress);

    expect(detail.calculateProgress(student.id, course.id, false)).toBe(33);
    expect(detail.calculateProgress(student.id, course.id, true)).toBe(33);
    expect(detail.getNextIncompleteLesson(student.id, course.id)?.id).toBe(
      b.id
    );
    expect(detail.getLessonProgress(student.id, course.id)).toHaveLength(2);
  });

  it("counts nothing on an empty course while other courses have content", () => {
    addOtherCourse();

    expect(detail.getLessonCount(course.id)).toBe(0);
    expect(detail.calculateProgress(student.id, course.id, false)).toBe(0);
    expect(detail.getLessonProgress(student.id, course.id)).toEqual([]);
    expect(detail.getCourseWithDetails(course.id)?.modules).toEqual([]);
  });

  it("gives no progress for empty modules while other courses have progress", () => {
    addOtherCourse();
    addModule("Empty", 1);

    expect(detail.getLessonProgress(student.id, course.id)).toEqual([]);
  });

  it("gives zero weighted progress when every lesson has zero length", () => {
    const mod = addModule("Only", 1);
    const lesson = addLesson(mod.id, "Instant", { durationMinutes: 0 });
    complete(lesson.id);

    expect(detail.calculateProgress(student.id, course.id, true)).toBe(0);
  });

  it("gives no next lesson when the modules have no lessons", () => {
    addModule("Empty", 1);

    expect(detail.getNextIncompleteLesson(student.id, course.id)).toBeNull();
    expect(detail.getLessonProgress(student.id, course.id)).toEqual([]);
    expect(detail.calculateProgress(student.id, course.id, true)).toBe(0);
  });
});

describe("ratings", () => {
  it("averages every Student's rating to one decimal place", () => {
    detail.rateCourse(student.id, course.id, 4);
    detail.rateCourse(addStudent("Bea").id, course.id, 4);
    detail.rateCourse(addStudent("Cal").id, course.id, 5);

    expect(detail.getRatingSummary(course.id)).toEqual({
      average: 4.3,
      count: 3,
    });
    expect(detail.findRating(student.id, course.id)?.rating).toBe(4);
  });

  it("finds only this Student's rating on this course", () => {
    const other = addOtherCourse();
    detail.rateCourse(addStudent("Bea").id, course.id, 4);
    detail.rateCourse(student.id, other.id, 2);

    expect(detail.findRating(student.id, course.id)).toBeUndefined();
    expect(detail.getRatingSummary(course.id).count).toBe(1);
  });

  it("accepts the lowest and highest ratings", () => {
    detail.rateCourse(student.id, course.id, 1);
    expect(detail.findRating(student.id, course.id)?.rating).toBe(1);
    detail.rateCourse(student.id, course.id, 5);
    expect(detail.findRating(student.id, course.id)?.rating).toBe(5);
  });

  it("refuses a rating below the scale or between stars", () => {
    expect(() => detail.rateCourse(student.id, course.id, 0)).toThrow(
      "Rating must be a whole number between 1 and 5"
    );
    expect(() => detail.rateCourse(student.id, course.id, 2.5)).toThrow(
      "Rating must be a whole number between 1 and 5"
    );
  });

  it("has no average before anyone rates", () => {
    expect(detail.getRatingSummary(course.id)).toEqual({
      average: null,
      count: 0,
    });
    expect(detail.findRating(student.id, course.id)).toBeUndefined();
  });

  it("replaces a Student's earlier rating rather than adding one", () => {
    detail.rateCourse(student.id, course.id, 2);
    detail.rateCourse(student.id, course.id, 5);

    expect(detail.findRating(student.id, course.id)?.rating).toBe(5);
    expect(detail.getRatingSummary(course.id)).toEqual({
      average: 5,
      count: 1,
    });
  });

  it("refuses a rating out of range or on a missing course", () => {
    expect(() => detail.rateCourse(student.id, course.id, 6)).toThrow();
    expect(() => detail.rateCourse(student.id, 9999, 3)).toThrow(
      "Course not found"
    );
  });
});
