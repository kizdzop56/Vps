// ─────────────────────────────────────────────────────────────────────────────
// Кто имеет право видеть учебные данные ученика.
//
// ЗАЧЕМ ОБЩИЙ МОДУЛЬ. Проверка нужна нескольким роутам (время, сдачи, ошибки,
// профиль), и раньше она жила копией внутри timeTracking.ts. Копия означает,
// что следующий эндпоинт напишут без проверки вовсе — что и произошло:
// GET /students/:id/submissions отдавал работы ЛЮБОГО ученика любому
// авторизованному пользователю. То есть чужой родитель мог прочитать результаты
// чужого ребёнка, просто подставив номер в адрес.
//
// ПРАВИЛО. Видеть учебные данные ученика может:
//   • сам ученик;
//   • администратор;
//   • учитель, у которого этот ученик ПОДТВЕРЖДЁН (status = accepted);
//   • родитель, у которого этот ученик прикреплён как ребёнок.
//
// Роли самой по себе недостаточно: «учитель» — это не пропуск ко всем ученикам
// приложения, нужна именно связь с этим учеником. Дружба тоже не подходит:
// друзья видят очки и медали (это витрина), но не работы и не время.
// ─────────────────────────────────────────────────────────────────────────────

import { db, teacherStudentsTable, parentChildrenTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import { isTeacher } from "./auth";

export interface Viewer {
  userId: number;
  role: string;
}

/**
 * Есть ли у смотрящего право на учебные данные ученика.
 *
 * Возвращает true/false и никогда не бросает: вызывающий роут сам решает, что
 * ответить — 403 или пустой блок в интерфейсе.
 */
export async function canViewStudent(viewer: Viewer, studentId: number): Promise<boolean> {
  if (!Number.isInteger(studentId) || studentId <= 0) return false;
  if (viewer.userId === studentId) return true;
  if (viewer.role === "admin") return true;

  if (isTeacher(viewer.role)) {
    const [link] = await db
      .select({ id: teacherStudentsTable.id })
      .from(teacherStudentsTable)
      .where(and(
        eq(teacherStudentsTable.teacherId, viewer.userId),
        eq(teacherStudentsTable.studentId, studentId),
        // Только подтверждённая связь: отправленный и не принятый запрос ещё
        // не даёт доступа к данным.
        eq(teacherStudentsTable.status, "accepted"),
      ));
    if (link) return true;
  }

  if (viewer.role === "parent") {
    const [link] = await db
      .select({ id: parentChildrenTable.id })
      .from(parentChildrenTable)
      .where(and(
        eq(parentChildrenTable.parentId, viewer.userId),
        eq(parentChildrenTable.studentId, studentId),
      ));
    if (link) return true;
  }

  return false;
}

export default canViewStudent;
