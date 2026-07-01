export { default } from "next-auth/middleware";

export const config = {
  matcher: ["/create-agent", "/create-agent/:path*"],
};
