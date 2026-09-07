require("dotenv").config();

const express = require("express");
const cors = require("cors");
const helmet = require("helmet");

const foundationRoutes = require("./modules/foundation/routes");
const accountingRoutes = require("./modules/accounting/routes");
const errorMiddleware = require("./middleware/error.middleware");
const env = require("./config/env");

const app = express();

app.use(helmet());
app.use(express.json({ limit: "1mb" }));
app.use(express.urlencoded({ extended: true, limit: "1mb" }));
app.use(
    cors({
        origin: env.clientOrigins,
        methods: ["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
        allowedHeaders: ["Content-Type", "Authorization"],
        credentials: true,
        maxAge: 86400,
    }),
);

app.get("/", (req, res) => {
    res.send("Welcome to the Finance Accounting API");
});

app.use("/api", foundationRoutes);
app.use("/api", accountingRoutes);

app.use(errorMiddleware);

module.exports = app;