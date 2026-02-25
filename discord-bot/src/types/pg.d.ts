// Type declaration for pg ESM module
declare module "pg" {
  export { Pool, PoolConfig, Client, ClientConfig, QueryResult } from "pg";
  export default { Pool };
}
