import { createServer, IncomingMessage, ServerResponse, Server as HttpServer } from "http"
import ItConcat from "it-concat"

async function main() {
  createServer(async (req, resp) => {
    console.log(await ItConcat(req, { type: "string" }))
    resp.statusCode = 404
    resp.statusMessage = "Not Found, Please POST /do"
    resp.end()
  }).listen(5000, () => {
    console.log(`Server listening`) 
  })
}

void(main())