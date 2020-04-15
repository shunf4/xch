const CryptoJS = require("crypto-js")

const main = async () => {
  console.log(CryptoJS.SHA256("ABC").toString(CryptoJS.enc.Hex))
}

void(main())
