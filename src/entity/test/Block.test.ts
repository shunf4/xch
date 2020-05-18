import "reflect-metadata"
import { createConnection, getConnectionOptions } from "typeorm"
import { Block } from "../Block"

test("create", async () => {
  const connectionOptions = await getConnectionOptions()
  Object.assign(connectionOptions, {
    database: ".xch/database.db"
  })
  await createConnection(connectionOptions)
})