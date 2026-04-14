import "dotenv/config";
import { createApp } from "./app.js";
import { logPassportModuleCompatibility } from "./chains/luxpass/readers/verifyPassportModuleAbi.js";

const port = Number(process.env.PORT || 3001);
const app = createApp();

void logPassportModuleCompatibility();

app.listen(port, () => {
  console.log(`[backend] listening on http://localhost:${port}`);
});