import { password } from "@inquirer/prompts";
import { hashPassword } from "@nodebooks/server/auth/password";

export const promptForNewPassword = async (
  label: string
): Promise<{ password: string; hash: string }> => {
  while (true) {
    const first = await password({
      message: `${label} password`,
      mask: "*",
      validate: (value) =>
        value && value.length >= 8
          ? true
          : "Password must be at least 8 characters",
    });
    const confirmValue = await password({
      message: "Confirm password",
      mask: "*",
    });
    if (first !== confirmValue) {
      console.log("Passwords do not match. Please try again.");
      continue;
    }
    const hash = await hashPassword(first);
    return { password: first, hash };
  }
};
