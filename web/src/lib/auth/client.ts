"use client";

/**
 * Cliente de Neon Auth para el navegador. Habla con `/api/auth/*` (mismo
 * origen, no hace falta pasarle una URL) y expone `signIn`, `signUp`,
 * `signOut`, `getSession`, etc.
 */
import { createAuthClient } from "@neondatabase/auth/next";

export const authClient = createAuthClient();
