import bcrypt from "bcryptjs";

export const hashPassword = async (password: string) => {
  return bcrypt.hash(password, 12);
};

export const verifyPassword = async (storedHash: string, password: string) => {
  return bcrypt.compare(password, storedHash);
};
