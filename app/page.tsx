import { cookies } from "next/headers";
import LoginForm from "@/components/LoginForm";
import { LAST_LOGIN_EMAIL_COOKIE } from "@/lib/auth";

export default async function LoginPage() {
  const cookieStore = await cookies();
  const rememberedEmail = cookieStore.get(LAST_LOGIN_EMAIL_COOKIE)?.value;

  return (
    <LoginForm
      initialState={
        rememberedEmail
          ? { step: "password", email: rememberedEmail }
          : { step: "email" }
      }
    />
  );
}
