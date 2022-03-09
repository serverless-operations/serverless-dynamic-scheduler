export const generateRandomString = (): string => {
  return Math.random().toString(32).substring(2);
};
