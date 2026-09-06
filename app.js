require("dotenv").config();

const express = require("express");
const cors = require("cors");

const foundationRoutes = require("./modules/foundation/routes");
const errorMiddleware = require("./middleware/error.middleware");

const app = express();

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cors());

app.get("/", (req, res) => {
    res.send("Welcome to the Finance Accounting API");
});

app.use("/api", foundationRoutes);

app.use(errorMiddleware);

module.exports = app;