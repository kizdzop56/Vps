import { Resend } from "resend";

const RESEND_API_KEY = process.env.RESEND_API_KEY;

export function isEmailConfigured() {
  return !!RESEND_API_KEY;
}

if (!isEmailConfigured()) {
  console.warn(
    "\n⚠️  Email не настроен! Письма не будут отправляться.\n" +
    "   Добавьте секрет: RESEND_API_KEY (ключ с resend.com)\n"
  );
}

const resend = RESEND_API_KEY ? new Resend(RESEND_API_KEY) : null;

const FROM = "English Learning <noreply@english-learning-replit.ru>";
const APP_URL = process.env.APP_URL ?? `https://${process.env.REPLIT_DEV_DOMAIN}`;

export async function sendVerificationCode(to: string, code: string) {
  if (!resend) {
    console.error(`[EMAIL] Не настроен. Код ${code} для ${to} НЕ отправлен.`);
    return;
  }
  try {
    const result = await resend.emails.send({
      from: FROM,
      to,
      subject: `${code} — ваш код подтверждения`,
      html: `
        <div style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:24px">
          <h2 style="color:#7c3aed;margin-bottom:8px">Подтвердите регистрацию</h2>
          <p style="color:#444;margin-bottom:24px">
            Вы создали аккаунт в приложении <strong>English Learning</strong>.<br>
            Введите этот код в приложении для подтверждения:
          </p>
          <div style="background:#f5f3ff;border-radius:16px;padding:24px;text-align:center;margin-bottom:24px">
            <span style="font-size:42px;font-weight:900;letter-spacing:10px;color:#7c3aed">${code}</span>
          </div>
          <p style="color:#888;font-size:13px">Код действителен 15 минут.</p>
        </div>
      `,
    });
    if (result.error) {
      console.error(`[EMAIL] Resend ошибка для ${to}:`, result.error);
    } else {
      console.log(`[EMAIL] Код отправлен на ${to}, id=${result.data?.id}`);
    }
  } catch (err) {
    console.error(`[EMAIL] Ошибка отправки на ${to}:`, err);
  }
}

export async function sendPasswordResetEmail(to: string, token: string) {
  if (!resend) {
    console.error(`[EMAIL] Не настроен. Письмо сброса для ${to} НЕ отправлено.`);
    return;
  }
  const link = `${APP_URL}/reset-password?token=${token}`;
  try {
    const result = await resend.emails.send({
      from: FROM,
      to,
      subject: "Сброс пароля — English Learning",
      html: `
        <div style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:24px">
          <h2 style="color:#7c3aed">Сброс пароля</h2>
          <p>Мы получили запрос на сброс пароля для вашего аккаунта.</p>
          <a href="${link}" style="display:inline-block;background:#7c3aed;color:#fff;padding:12px 28px;border-radius:10px;text-decoration:none;font-weight:700;margin:16px 0">
            Сбросить пароль
          </a>
          <p style="color:#888;font-size:13px">Ссылка действительна 1 час.</p>
        </div>
      `,
    });
    if (result.error) {
      console.error(`[EMAIL] Resend ошибка сброса для ${to}:`, result.error);
    } else {
      console.log(`[EMAIL] Сброс пароля отправлен на ${to}, id=${result.data?.id}`);
    }
  } catch (err) {
    console.error(`[EMAIL] Ошибка сброса на ${to}:`, err);
  }
}
