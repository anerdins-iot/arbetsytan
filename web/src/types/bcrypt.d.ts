declare module "bcrypt" {
  function hash(
    data: string | Buffer,
    saltOrRounds: string | number
  ): Promise<string>;
  function compare(data: string | Buffer, encrypted: string): Promise<boolean>;
}
