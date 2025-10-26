// DEV: Temporary router for infrastructure validation (tasks 4.1.10 & 4.1.11)
// May be removed or evolved into permanent health-check endpoint after Phase 1

import { Router, type Router as RouterType } from 'express';
import { helloController } from '../controllers/hello.controller.js';

export const helloRouter: RouterType = Router();

// GET / (will be mounted at /api/hello)
helloRouter.get('/', helloController.greet);
