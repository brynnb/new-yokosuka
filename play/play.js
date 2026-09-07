import { PlayApplication } from "./PlayApplication.js";

const application = new PlayApplication();
application.start().catch(error => application.showStartupError(error));
