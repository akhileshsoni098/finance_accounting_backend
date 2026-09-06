const app = require("./app");
const { connectDB } = require("./config/db");
const { port } = require("./config/env");

async function start() {
    try {
        await connectDB();
        console.log("Connected to MongoDB");
        app.listen(port, () => {
            console.log(`Server is running on port ${port}`);
        });
    } catch (error) {
        console.error("Error connecting to MongoDB:", error);
        process.exit(1);
    }
}

start();