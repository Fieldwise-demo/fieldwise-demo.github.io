import { createAppController } from "./app-controller.js";
import { createDemoProvider } from "./data/demo-provider.js";

const app = createAppController({ provider: createDemoProvider() });
app.start();
