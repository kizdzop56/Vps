export function formatStudentName(
  user: { username: string; name?: string | null; surname?: string | null },
  viewerRole?: string | null,
): string {
  const isTeacherOrAdmin = viewerRole === "teacher" || viewerRole === "admin";
  if (isTeacherOrAdmin) {
    const parts = [user.name, user.surname].filter(Boolean).join(" ");
    if (parts && parts !== user.username) {
      return `${user.username} (${parts})`;
    }
  }
  return user.username;
}
