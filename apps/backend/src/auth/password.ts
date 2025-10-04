import {
  randomBytes,
  scrypt as scryptCallback,
  timingSafeEqual,
} from "node:crypto";
import { promisify } from "node:util";

const scrypt = promisify(scryptCallback);

const SALT_LENGTH = 16; // 128-bit salt
const KEY_LENGTH = 64; // 512-bit derived key
const HASH_PREFIX = "scrypt";

const encodeBuffer = (buffer: Buffer) => buffer.toString("base64");
const decodeBuffer = (value: string) => Buffer.from(value, "base64");

export const hashPassword = async (password: string) => {
  const salt = randomBytes(SALT_LENGTH);
  const derived = (await scrypt(password, salt, KEY_LENGTH)) as Buffer;
  return `${HASH_PREFIX}:${encodeBuffer(salt)}:${encodeBuffer(derived)}`;
};

export const verifyPassword = async (storedHash: string, password: string) => {
  const segments = storedHash.split(":");
  if (segments.length !== 3 || segments[0] !== HASH_PREFIX) {
    return false;
  }
  const salt = decodeBuffer(segments[1]);
  const storedKey = decodeBuffer(segments[2]);
  const derived = (await scrypt(password, salt, storedKey.length)) as Buffer;
  return timingSafeEqual(storedKey, derived);
};
