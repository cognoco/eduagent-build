import { defineConfig } from "deepsec/config";

export default defineConfig({
  projects: [
    { id: "eduagent-build", root: ".." },
    // <deepsec:projects-insert-above>
  ],
});
