const dns = require("node:dns");
dns.setServers(["8.8.8.8", "8.8.4.4"]);

const express = require("express");
const dotenv = require("dotenv");
dotenv.config();
const app = express()
const port = process.env.PORT || 5000;


// mongodb uri


// middleware
app.use(cors());
app.use(express.json());

// ----------------------- mongodb start ---------------------------


// ----------------------- mongodb ends ----------------------------

app.get('/', (req, res) => {
  res.send('Hello World!')
})

app.listen(port, () => {
  console.log(`Example app listening on port ${port}`)
})