/**
 * Un solo archivo atiende registro, entrada, salida y sesion: reenvia todo a
 * Neon Auth y se encarga de las cookies de sesion.
 */
import { auth } from "@/lib/auth/server";

export const { GET, POST } = auth.handler();
