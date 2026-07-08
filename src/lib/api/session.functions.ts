import { createServerFn } from "@tanstack/react-start";

import { readCurrentUser, type CurrentUser } from "../auth.server";

export const getSessionUser = createServerFn({ method: "GET" }).handler(
  async (): Promise<CurrentUser> => readCurrentUser(),
);

