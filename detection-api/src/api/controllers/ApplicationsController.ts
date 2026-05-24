/**
 * API v2 Applications Controller - Clean Implementation
 *
 * This replaces the messy v1 apps.ts file.
 * Each endpoint does one thing, with clear error handling.
 *
 * "Good APIs are designed, not evolved." - API Design Principles
 */
import { Router } from 'express';
import { accessSync, constants, existsSync, statSync } from 'fs';
import { normalize, resolve } from 'path';
import { ApplicationError } from '../../core/types';
import { logger } from '../../utils/logger';
import { AppConfigValidator } from '../../services/AppConfigValidator';
import { ConfigFixer } from '../../services/ConfigFixer';
import { auditLogService } from '../../services/auditLogService';
export class ApplicationsController {
    applicationService;
    serviceContainer;
    router = Router();
    configValidator;
    configFixer;
    constructor(applicationService, serviceContainer) {
        this.applicationService = applicationService;
        this.serviceContainer = serviceContainer;
        this.configValidator = new AppConfigValidator();
        this.configFixer = new ConfigFixer();
        this.setupRoutes();
    }

    setupRoutes() {
        // Collection routes
        this.router.get('/', this.handleGetApplications.bind(this));
        this.router.post('/', this.handleCreateApplication.bind(this));
        this.router.get('/stats/processes', this.handleGetProcessStats.bind(this));
        this.router.get('/processes/running', this.handleGetRunningProcesses.bind(this));
        this.router.get('/pinned', this.handleGetPinnedApplications.bind(this));
        this.router.post('/import/precheck', this.handleImportPrecheck.bind(this));
        this.router.post('/import/batch', this.handleBatchImport.bind(this));

        // Port management routes
        this.router.post('/ports/:port/cleanup', this.handleCleanupPort.bind(this));
        this.router.post('/ports/cleanup-dev', this.handleCleanupDevelopmentPorts.bind(this));
        this.router.get('/ports/:port/status', this.handleGetPortStatus.bind(this));
        this.router.post('/ports/scan/range', this.handleScanPortRange.bind(this));
        this.router.post('/ports/check-conflicts', this.handleCheckPortConflicts.bind(this));

        // Configuration routes
        this.router.get('/:id/config/validate', this.handleValidateConfig.bind(this));
        this.router.post('/:id/config/fix', this.handleFixConfig.bind(this));

        // Application specific routes
        this.router.get('/:id/logs', this.handleGetApplicationLogs.bind(this));
        this.router.put('/:id/start', this.handleStartApplication.bind(this));
        this.router.put('/:id/stop', this.handleStopApplication.bind(this));
        this.router.put('/:id', this.handleUpdateApplication.bind(this));
        this.router.patch('/:id/pin', this.handleSetApplicationPin.bind(this));
        this.router.delete('/:id', this.handleDeleteApplication.bind(this));
        this.router.get('/:id', this.handleGetApplication.bind(this));
    }
    async handleGetApplications(req, res) {
        try {
            const applications = await this.applicationService.findAll();
            const page = parseInt(req.query.page, 10) || 1;
            const limit = parseInt(req.query.limit, 10) || 1000;
            const startIndex = (page - 1) * limit;
            const endIndex = startIndex + limit;
            const paginatedData = applications.slice(startIndex, endIndex);
            res.json({
                success: true,
                data: paginatedData,
                pagination: {
                    page,
                    limit,
                    total: applications.length,
                    totalPages: Math.ceil(applications.length / limit)
                }
            });
        }
        catch (error) {
            this.handleError(res, error, 'Failed to fetch applications');
        }
    }
    async handleGetApplication(req, res) {
        try {
            const application = await this.applicationService.findById(req.params.id);
            res.json({
                success: true,
                data: application
            });
        }
        catch (error) {
            this.handleError(res, error, 'Failed to fetch application');
        }
    }
    async handleGetPinnedApplications(_req, res) {
        try {
            const applications = await this.applicationService.findAll();
            const pinned = applications.filter(app => app?.metadata?.pinned === true);
            res.json({
                success: true,
                data: pinned
            });
        }
        catch (error) {
            this.handleError(res, error, 'Failed to fetch pinned applications');
        }
    }
    async handleImportPrecheck(req, res) {
        try {
            this.requireRoles(req, ['admin', 'operator'], 'import_precheck');
            const candidates = this.validateImportCandidates(req.body);
            const result = await this.buildImportPrecheck(candidates);
            res.json({
                success: true,
                data: result,
                message: `预检查完成：可导入 ${result.summary.importable}/${result.summary.total}`
            });
        }
        catch (error) {
            this.handleError(res, error, 'Failed to precheck import candidates');
        }
    }
    async handleBatchImport(req, res) {
        try {
            this.requireRoles(req, ['admin'], 'batch_import_applications');
            const rollbackOnError = req?.body?.rollbackOnError !== false;
            const candidates = this.validateImportCandidates(req.body);
            const precheck = await this.buildImportPrecheck(candidates);
            const importableItems = precheck.items.filter(item => item.canImport);
            const skipped = precheck.items.filter(item => !item.canImport);
            const created = [];
            const failed = [];
            for (const item of importableItems) {
                try {
                    const app = await this.applicationService.create({
                        name: item.candidate.name,
                        directory: item.candidate.directory,
                        techStack: item.candidate.techStack,
                        description: item.candidate.description,
                        icon: item.candidate.icon,
                        color: item.candidate.color,
                        primaryPort: item.candidate.frontendPort,
                        secondaryPorts: item.candidate.backendPort ? [item.candidate.backendPort] : undefined,
                        protocol: 'http'
                    });
                    await this.ensureExternalExePortReservation(app, 'batch-import');
                    created.push({
                        index: item.index,
                        app,
                        candidate: item.candidate
                    });
                }
                catch (error) {
                    failed.push({
                        index: item.index,
                        candidate: item.candidate,
                        error: error?.message || String(error),
                        code: error?.code
                    });
                }
            }
            let rolledBack = false;
            const rollbackErrors = [];
            if (rollbackOnError && failed.length > 0 && created.length > 0) {
                for (const createdItem of [...created].reverse()) {
                    try {
                        await this.applicationService.delete(createdItem.app.id);
                    }
                    catch (rollbackError) {
                        rollbackErrors.push({
                            appId: createdItem.app.id,
                            appName: createdItem.app.name,
                            error: rollbackError?.message || String(rollbackError)
                        });
                    }
                }
                rolledBack = rollbackErrors.length === 0;
            }
            this.logLifecycleEvent(req, {
                action: 'application.lifecycle.import_batch',
                success: failed.length === 0 && rollbackErrors.length === 0,
                details: {
                    totalCandidates: candidates.length,
                    importable: importableItems.length,
                    skipped: skipped.length,
                    created: created.length,
                    failed: failed.length,
                    rollbackOnError,
                    rolledBack,
                    rollbackErrors: rollbackErrors.length
                }
            });
            res.json({
                success: failed.length === 0 && rollbackErrors.length === 0,
                data: {
                    precheck,
                    created: rolledBack ? [] : created,
                    failed,
                    skipped,
                    rolledBack,
                    rollbackErrors,
                    summary: {
                        total: candidates.length,
                        importable: importableItems.length,
                        created: rolledBack ? 0 : created.length,
                        failed: failed.length,
                        skipped: skipped.length
                    }
                },
                message: failed.length === 0
                    ? `成功导入 ${created.length} 个应用`
                    : (rolledBack
                        ? `导入失败，已回滚 ${created.length} 个已创建应用`
                        : `导入完成，成功 ${created.length}，失败 ${failed.length}`)
            });
        }
        catch (error) {
            this.logLifecycleEvent(req, {
                action: 'application.lifecycle.import_batch',
                success: false,
                details: {
                    error: error?.message || String(error)
                }
            });
            this.handleError(res, error, 'Failed to batch import applications');
        }
    }
    async handleCreateApplication(req, res) {
        try {
            this.requireRoles(req, ['admin'], 'create_application');
            const input = this.validateCreateInput(req.body);
            const precheck = await this.ensureCreatePreconditions(input);
            const createInput = precheck.normalizedDirectory
                ? {
                    ...input,
                    directory: precheck.normalizedDirectory
                }
                : input;
            const application = await this.applicationService.create(createInput);
            await this.ensureExternalExePortReservation(application, 'create');
            this.logLifecycleEvent(req, {
                action: 'application.lifecycle.create',
                success: true,
                details: {
                    appId: application.id,
                    appName: application.name
                }
            });
            res.status(201).json({
                success: true,
                data: application,
                message: 'Application created successfully'
            });
        }
        catch (error) {
            this.logLifecycleEvent(req, {
                action: 'application.lifecycle.create',
                success: false,
                details: {
                    error: error?.message || String(error)
                }
            });
            this.handleError(res, error, 'Failed to create application');
        }
    }
    async handleUpdateApplication(req, res) {
        try {
            const input = this.validateUpdateInput(req.body);
            if (input.techStack) {
                this.requireRoles(req, ['admin'], 'update_tech_stack');
            }
            const application = await this.applicationService.update(req.params.id, input);
            this.logLifecycleEvent(req, {
                action: 'application.lifecycle.update',
                success: true,
                details: {
                    appId: req.params.id,
                    changes: Object.keys(input)
                }
            });
            res.json({
                success: true,
                data: application,
                message: 'Application updated successfully'
            });
        }
        catch (error) {
            this.logLifecycleEvent(req, {
                action: 'application.lifecycle.update',
                success: false,
                details: {
                    appId: req.params.id,
                    error: error?.message || String(error)
                }
            });
            this.handleError(res, error, 'Failed to update application');
        }
    }
    async handleSetApplicationPin(req, res) {
        try {
            this.requireRoles(req, ['admin'], 'set_application_pin');
            const pinned = this.parsePinnedInput(req.body);
            const application = await this.applicationService.update(req.params.id, { pinned });
            this.logLifecycleEvent(req, {
                action: 'application.lifecycle.pin',
                success: true,
                details: {
                    appId: req.params.id,
                    pinned
                }
            });
            res.json({
                success: true,
                data: application,
                message: pinned ? 'Application pinned to homepage' : 'Application unpinned from homepage'
            });
        }
        catch (error) {
            this.logLifecycleEvent(req, {
                action: 'application.lifecycle.pin',
                success: false,
                details: {
                    appId: req.params.id,
                    error: error?.message || String(error)
                }
            });
            this.handleError(res, error, 'Failed to update application pin status');
        }
    }
    async handleDeleteApplication(req, res) {
        try {
            this.requireRoles(req, ['admin'], 'delete_application');
            const app = await this.applicationService.findById(req.params.id);
            await this.applicationService.delete(req.params.id);
            this.logLifecycleEvent(req, {
                action: 'application.lifecycle.delete',
                success: true,
                details: {
                    appId: req.params.id,
                    appName: app?.name
                }
            });
            res.status(204).send();
        }
        catch (error) {
            this.logLifecycleEvent(req, {
                action: 'application.lifecycle.delete',
                success: false,
                details: {
                    appId: req.params.id,
                    error: error?.message || String(error)
                }
            });
            this.handleError(res, error, 'Failed to delete application');
        }
    }
    async handleStartApplication(req, res) {
        try {
            const { id } = req.params;
            const appBefore = await this.applicationService.findById(id);
            await this.applicationService.start(id);
            const app = await this.applicationService.findById(id);
            const url = this.generateAppUrl(req, app, app.network?.primaryPort || 3000);
            this.logLifecycleEvent(req, {
                action: 'application.lifecycle.start',
                success: true,
                details: {
                    appId: id,
                    appName: app.name,
                    fromState: appBefore.state,
                    toState: app.state,
                    primaryPort: app.network?.primaryPort
                }
            });
            res.json({
                success: true,
                data: {
                    id: app.id,
                    name: app.name,
                    status: app.state,
                    url,
                    ports: {
                        primary: app.network?.primaryPort,
                        secondary: app.network?.secondaryPorts
                    }
                },
                message: 'Application started successfully'
            });
        }
        catch (error) {
            this.logLifecycleEvent(req, {
                action: 'application.lifecycle.start',
                success: false,
                details: {
                    appId: req.params?.id,
                    error: error?.message || String(error)
                }
            });
            this.handleError(res, error, 'Failed to start application');
        }
    }
    async handleStopApplication(req, res) {
        try {
            const { id } = req.params;
            const appBefore = await this.applicationService.findById(id);
            await this.applicationService.stop(id);
            const app = await this.applicationService.findById(id);
            this.logLifecycleEvent(req, {
                action: 'application.lifecycle.stop',
                success: true,
                details: {
                    appId: id,
                    appName: app.name,
                    fromState: appBefore.state,
                    toState: app.state
                }
            });
            res.json({
                success: true,
                data: app,
                message: 'Application stopped successfully'
            });
        }
        catch (error) {
            this.logLifecycleEvent(req, {
                action: 'application.lifecycle.stop',
                success: false,
                details: {
                    appId: req.params?.id,
                    error: error?.message || String(error)
                }
            });
            this.handleError(res, error, 'Failed to stop application');
        }
    }
    async handleGetApplicationLogs(req, res) {
        try {
            const processManager = this.getOptionalService('processManager');
            if (!processManager || typeof processManager.getProcessLogs !== 'function') {
                res.status(503).json({
                    success: false,
                    error: 'Process manager not available'
                });
                return;
            }
            const lines = req.query.lines ? parseInt(req.query.lines, 10) : undefined;
            const rawTarget = typeof req.query.target === 'string' ? req.query.target.toLowerCase() : '';
            const target = rawTarget === 'frontend' || rawTarget === 'backend' ? rawTarget : 'all';
            const logs = processManager.getProcessLogs(req.params.id, lines, target);
            res.json({
                success: true,
                data: {
                    appId: req.params.id,
                    target,
                    lines: logs
                }
            });
        }
        catch (error) {
            this.handleError(res, error, 'Failed to fetch application logs');
        }
    }
    async handleGetProcessStats(req, res) {
        try {
            const processManager = this.getOptionalService('processManager');
            if (!processManager || typeof processManager.getProcessStats !== 'function') {
                res.json({
                    success: true,
                    data: {
                        total: 0,
                        running: 0,
                        stopped: 0,
                        errors: 0
                    }
                });
                return;
            }
            const stats = processManager.getProcessStats();
            res.json({
                success: true,
                data: stats
            });
        }
        catch (error) {
            this.handleError(res, error, 'Failed to fetch process stats');
        }
    }
    async handleGetRunningProcesses(req, res) {
        try {
            const processManager = this.getOptionalService('processManager');
            if (!processManager || typeof processManager.getRunningProcesses !== 'function') {
                res.json({
                    success: true,
                    data: []
                });
                return;
            }
            const processes = processManager.getRunningProcesses();
            const list = Array.from(processes.entries()).map(([appId, info]) => ({
                appId,
                command: info.command,
                args: info.args,
                cwd: info.cwd,
                port: info.port,
                processType: info.processType,
                appName: info.appName,
                startedAt: info.startedAt instanceof Date ? info.startedAt.toISOString() : info.startedAt
            }));
            res.json({
                success: true,
                data: list
            });
        }
        catch (error) {
            this.handleError(res, error, 'Failed to fetch running processes');
        }
    }
    validateCreateInput(body) {
        if (!body || typeof body !== 'object') {
            throw new ApplicationError('Invalid request payload', 'VALIDATION_ERROR');
        }
        const errors = [];
        const name = typeof body.name === 'string' ? body.name.trim() : '';
        const directory = typeof body.directory === 'string' ? body.directory.trim() : '';
        const techStack = typeof body.techStack === 'string' ? body.techStack.trim() : '';
        if (!name) {
            errors.push('name is required');
        }
        if (!directory) {
            errors.push('directory is required');
        }
        if (!techStack) {
            errors.push('techStack is required');
        }
        let protocol;
        if (typeof body.protocol === 'string' && body.protocol.trim() !== '') {
            const normalized = body.protocol.trim().toLowerCase();
            if (normalized !== 'http' && normalized !== 'https') {
                errors.push('protocol must be http or https');
            }
            else {
                protocol = normalized;
            }
        }
        let primaryPort;
        if (body.primaryPort !== undefined && body.primaryPort !== null && body.primaryPort !== '') {
            primaryPort = Number(body.primaryPort);
            if (!Number.isInteger(primaryPort) || primaryPort < 1 || primaryPort > 65535) {
                errors.push('primaryPort must be a valid TCP port');
            }
        }
        let secondaryPorts = [];
        if (Array.isArray(body.secondaryPorts)) {
            secondaryPorts = body.secondaryPorts
                .map(Number)
                .filter(port => Number.isInteger(port) && port > 0 && port <= 65535);
            if (secondaryPorts.length !== body.secondaryPorts.length) {
                errors.push('secondaryPorts must be valid TCP ports');
            }
        }
        else if (body.secondaryPorts !== undefined && body.secondaryPorts !== null && body.secondaryPorts !== '') {
            const port = Number(body.secondaryPorts);
            if (!Number.isInteger(port) || port < 1 || port > 65535) {
                errors.push('secondaryPorts must contain valid TCP ports');
            }
            else {
                secondaryPorts = [port];
            }
        }
        const hasSecondaryPorts = secondaryPorts.length > 0;
        const fullStackRangeCheck = techStack.toLowerCase().includes('fullstack') || hasSecondaryPorts;
        if (fullStackRangeCheck) {
            const portRanges = this.getImportPortRanges();
            if (typeof primaryPort === 'number' && !this.isPortInRange(primaryPort, portRanges.frontend)) {
                errors.push(`primaryPort 必须在前端端口范围 ${portRanges.frontend.start}-${portRanges.frontend.end} 内`);
            }
            for (const port of secondaryPorts) {
                if (!this.isPortInRange(port, portRanges.backend)) {
                    errors.push(`secondaryPorts 必须在后端端口范围 ${portRanges.backend.start}-${portRanges.backend.end} 内`);
                    break;
                }
            }
        }
        const description = typeof body.description === 'string' && body.description.trim() !== '' ? body.description.trim() : undefined;
        const icon = typeof body.icon === 'string' && body.icon.trim() !== '' ? body.icon.trim() : undefined;
        const color = typeof body.color === 'string' && body.color.trim() !== '' ? body.color.trim() : undefined;
        const buildScriptRaw = typeof body.buildScript === 'string'
            ? body.buildScript.trim()
            : (typeof body.build_script === 'string' ? body.build_script.trim() : '');
        const buildScript = buildScriptRaw !== '' ? buildScriptRaw : undefined;
        let normalizedBuildScript;
        if (buildScript) {
            normalizedBuildScript = this.normalizePath(buildScript);
        }
        if (techStack.toLowerCase() === 'external-exe') {
            if (!buildScript) {
                errors.push('buildScript is required for external-exe');
            }
            else if (!normalizedBuildScript || !existsSync(normalizedBuildScript)) {
                errors.push('buildScript must point to an existing executable file');
            }
            else {
                try {
                    const scriptStat = statSync(normalizedBuildScript);
                    if (!scriptStat.isFile()) {
                        errors.push('buildScript must be a file path');
                    }
                }
                catch (_error) {
                    errors.push('buildScript is not accessible');
                }
            }
        }
        if (errors.length > 0) {
            throw new ApplicationError(errors.join('; '), 'VALIDATION_ERROR', { errors });
        }
        return {
            name,
            directory,
            techStack,
            description,
            icon,
            color,
            primaryPort,
            secondaryPorts: secondaryPorts.length > 0 ? secondaryPorts : undefined,
            protocol,
            buildScript: normalizedBuildScript
        };
    }
    async ensureCreatePreconditions(input) {
        const normalizedDirectory = this.normalizePath(input.directory);
        const existingApps = await this.applicationService.findAll();
        const duplicate = existingApps.find((app) => this.normalizePath(app?.directory) === normalizedDirectory);
        if (duplicate) {
            throw new ApplicationError('Application already exists at this directory', 'DIRECTORY_ALREADY_EXISTS', {
                directory: input.directory,
                normalizedDirectory,
                existingAppId: duplicate.id,
                existingAppName: duplicate.name
            });
        }
        const directoryValidation = this.validateDirectoryAccess(input.directory);
        if (!directoryValidation.isValid) {
            throw new ApplicationError(directoryValidation.message || 'Invalid application directory', directoryValidation.code || 'APPLICATION_DIRECTORY_NOT_FOUND', {
                ...directoryValidation.context,
                directory: input.directory
            });
        }
        const ports = [];
        if (typeof input.primaryPort === 'number') {
            ports.push(input.primaryPort);
        }
        if (Array.isArray(input.secondaryPorts) && input.secondaryPorts.length > 0) {
            for (const port of input.secondaryPorts) {
                if (typeof port === 'number') {
                    ports.push(port);
                }
            }
        }
        if (ports.length > 0) {
            const uniquePorts = [...new Set(ports)];
            const portConflicts = await this.checkPortConflicts(uniquePorts);
            if (portConflicts.length > 0) {
                throw new ApplicationError(`端口冲突：${portConflicts.map(conflict => conflict.port).join(', ')}`, 'PORT_CONFLICTS', {
                    ports: uniquePorts,
                    conflicts: portConflicts
                });
            }
        }
        return {
            normalizedDirectory: directoryValidation.normalizedDirectory || input.directory
        };
    }
    validateDirectoryAccess(directory) {
        const normalizedDirectory = this.normalizePath(directory);
        if (!normalizedDirectory) {
            return {
                isValid: false,
                code: 'VALIDATION_ERROR',
                message: 'directory is required'
            };
        }
        if (!existsSync(normalizedDirectory)) {
            return {
                isValid: false,
                code: 'APPLICATION_DIRECTORY_NOT_FOUND',
                message: `Application directory does not exist: ${normalizedDirectory}`,
                context: {
                    normalizedDirectory
                }
            };
        }
        let stats;
        try {
            stats = statSync(normalizedDirectory);
        }
        catch (error) {
            return {
                isValid: false,
                code: 'APPLICATION_DIRECTORY_NOT_FOUND',
                message: `Application directory is not accessible: ${normalizedDirectory}`,
                context: {
                    normalizedDirectory,
                    reason: error?.message || String(error)
                }
            };
        }
        if (!stats.isDirectory()) {
            return {
                isValid: false,
                code: 'APPLICATION_DIRECTORY_NOT_FOUND',
                message: `Application directory is not a folder: ${normalizedDirectory}`,
                context: {
                    normalizedDirectory
                }
            };
        }
        try {
            accessSync(normalizedDirectory, constants.R_OK);
        }
        catch (error) {
            return {
                isValid: false,
                code: 'APPLICATION_DIRECTORY_NOT_FOUND',
                message: `Application directory is not readable: ${normalizedDirectory}`,
                context: {
                    normalizedDirectory,
                    reason: error?.message || String(error)
                }
            };
        }
        return {
            isValid: true,
            normalizedDirectory
        };
    }
    validateUpdateInput(body) {
        if (!body || typeof body !== 'object') {
            throw new ApplicationError('Invalid request payload', 'VALIDATION_ERROR');
        }
        const result: any = {};
        if (typeof body.name === 'string' && body.name.trim() !== '') {
            result.name = body.name.trim();
        }
        if (typeof body.description === 'string' && body.description.trim() !== '') {
            result.description = body.description.trim();
        }
        if (typeof body.icon === 'string' && body.icon.trim() !== '') {
            result.icon = body.icon.trim();
        }
        if (typeof body.color === 'string' && body.color.trim() !== '') {
            result.color = body.color.trim();
        }
        if (typeof body.techStack === 'string' && body.techStack.trim() !== '') {
            result.techStack = body.techStack.trim();
        }
        const pinned = this.tryParsePinnedInput(body);
        if (typeof pinned === 'boolean') {
            result.pinned = pinned;
        }
        const accessPathInput = this.tryParseAccessPathInput(body);
        if (accessPathInput.provided) {
            result.accessPath = accessPathInput.value;
        }
        if (Object.prototype.hasOwnProperty.call(body, 'directory')) {
            const directory = typeof body.directory === 'string' ? body.directory.trim() : '';
            if (!directory) {
                throw new ApplicationError('directory must be a non-empty string', 'VALIDATION_ERROR', {
                    field: 'directory'
                });
            }
            const normalizedDirectory = this.normalizePath(directory);
            const directoryValidation = this.validateDirectoryAccess(normalizedDirectory);
            if (!directoryValidation.isValid) {
                throw new ApplicationError(directoryValidation.message || 'Invalid application directory', directoryValidation.code || 'APPLICATION_DIRECTORY_NOT_FOUND', {
                    ...directoryValidation.context,
                    directory: normalizedDirectory
                });
            }
            result.directory = directoryValidation.normalizedDirectory || normalizedDirectory;
        }
        const hasBuildScriptField = Object.prototype.hasOwnProperty.call(body, 'buildScript')
            || Object.prototype.hasOwnProperty.call(body, 'build_script');
        if (hasBuildScriptField) {
            const rawBuildScript = typeof body.buildScript === 'string'
                ? body.buildScript.trim()
                : (typeof body.build_script === 'string' ? body.build_script.trim() : '');
            if (!rawBuildScript) {
                throw new ApplicationError('buildScript must be a non-empty string', 'VALIDATION_ERROR', {
                    field: 'buildScript'
                });
            }
            const normalizedBuildScript = this.normalizePath(rawBuildScript);
            if (!normalizedBuildScript || !existsSync(normalizedBuildScript)) {
                throw new ApplicationError('buildScript must point to an existing executable file', 'VALIDATION_ERROR', {
                    field: 'buildScript',
                    buildScript: rawBuildScript
                });
            }
            try {
                const scriptStat = statSync(normalizedBuildScript);
                if (!scriptStat.isFile()) {
                    throw new ApplicationError('buildScript must be a file path', 'VALIDATION_ERROR', {
                        field: 'buildScript',
                        buildScript: normalizedBuildScript
                    });
                }
            }
            catch (error) {
                if (error instanceof ApplicationError) {
                    throw error;
                }
                throw new ApplicationError('buildScript is not accessible', 'VALIDATION_ERROR', {
                    field: 'buildScript',
                    buildScript: normalizedBuildScript,
                    reason: error instanceof Error ? error.message : String(error)
                });
            }
            result.buildScript = normalizedBuildScript;
        }
        // Validate port configuration
        if (Object.prototype.hasOwnProperty.call(body, 'primaryPort')) {
            const primaryPort = body.primaryPort;
            if (typeof primaryPort === 'number') {
                if (!Number.isInteger(primaryPort) || primaryPort < 1 || primaryPort > 65535) {
                    throw new ApplicationError('primaryPort must be a valid TCP port (1-65535)', 'VALIDATION_ERROR', {
                        field: 'primaryPort',
                        value: primaryPort
                    });
                }
                result.primaryPort = primaryPort;
            } else if (primaryPort !== null && primaryPort !== undefined) {
                throw new ApplicationError('primaryPort must be a number', 'VALIDATION_ERROR', {
                    field: 'primaryPort'
                });
            }
        }
        if (Object.prototype.hasOwnProperty.call(body, 'secondaryPorts')) {
            const secondaryPorts = body.secondaryPorts;
            if (Array.isArray(secondaryPorts)) {
                const validPorts = secondaryPorts.every(port =>
                    typeof port === 'number' &&
                    Number.isInteger(port) &&
                    port >= 1 &&
                    port <= 65535
                );
                if (!validPorts) {
                    throw new ApplicationError('All secondary ports must be valid TCP ports (1-65535)', 'VALIDATION_ERROR', {
                        field: 'secondaryPorts'
                    });
                }
                result.secondaryPorts = secondaryPorts;
            } else if (secondaryPorts !== null && secondaryPorts !== undefined) {
                throw new ApplicationError('secondaryPorts must be an array', 'VALIDATION_ERROR', {
                    field: 'secondaryPorts'
                });
            }
        }
        if (Object.prototype.hasOwnProperty.call(body, 'protocol')) {
            const protocol = body.protocol;
            if (protocol === 'http' || protocol === 'https') {
                result.protocol = protocol;
            } else if (protocol !== null && protocol !== undefined) {
                throw new ApplicationError('protocol must be either "http" or "https"', 'VALIDATION_ERROR', {
                    field: 'protocol',
                    value: protocol
                });
            }
        }
        if (Object.keys(result).length === 0) {
            throw new ApplicationError('No valid fields provided to update', 'VALIDATION_ERROR');
        }
        return result;
    }
    parsePinnedInput(body) {
        const pinned = this.tryParsePinnedInput(body);
        if (typeof pinned !== 'boolean') {
            throw new ApplicationError('pinned flag is required', 'VALIDATION_ERROR', {
                supportedFields: ['pinned', 'pinned_to_homepage', 'pinnedToHomepage']
            });
        }
        return pinned;
    }
    tryParsePinnedInput(body) {
        if (!body || typeof body !== 'object') {
            return undefined;
        }
        const value = body.pinned ?? body.pinned_to_homepage ?? body.pinnedToHomepage;
        if (typeof value === 'boolean') {
            return value;
        }
        if (typeof value === 'number') {
            if (value === 1) {
                return true;
            }
            if (value === 0) {
                return false;
            }
        }
        if (typeof value === 'string') {
            const normalized = value.trim().toLowerCase();
            if (normalized === 'true' || normalized === '1') {
                return true;
            }
            if (normalized === 'false' || normalized === '0') {
                return false;
            }
        }
        return undefined;
    }
    tryParseAccessPathInput(body) {
        if (!body || typeof body !== 'object') {
            return { provided: false };
        }
        const hasAccessPathField = Object.prototype.hasOwnProperty.call(body, 'accessPath')
            || Object.prototype.hasOwnProperty.call(body, 'access_path')
            || Object.prototype.hasOwnProperty.call(body, 'entryPath');
        if (!hasAccessPathField) {
            return { provided: false };
        }
        const rawValue = body.accessPath ?? body.access_path ?? body.entryPath;
        if (rawValue === null) {
            return { provided: true, value: null };
        }
        if (typeof rawValue !== 'string') {
            throw new ApplicationError('accessPath must be a string', 'VALIDATION_ERROR', {
                supportedFields: ['accessPath', 'access_path', 'entryPath']
            });
        }
        const trimmed = rawValue.trim();
        if (!trimmed || trimmed === '/') {
            return { provided: true, value: null };
        }
        if (/^[a-zA-Z][a-zA-Z0-9+.-]*:\/\//.test(trimmed) || trimmed.includes('://')) {
            throw new ApplicationError('accessPath must be a relative path', 'VALIDATION_ERROR', {
                value: trimmed
            });
        }
        const normalized = trimmed.replace(/\\/g, '/');
        const withSlash = normalized.startsWith('/') ? normalized : `/${normalized}`;
        const pathOnly = withSlash.split('?')[0]?.split('#')[0] || withSlash;
        if (pathOnly.includes('..')) {
            throw new ApplicationError('accessPath cannot contain ".."', 'VALIDATION_ERROR', {
                value: withSlash
            });
        }
        return { provided: true, value: withSlash };
    }
    isExternalExeApp(app) {
        const tech = String(app?.techStack?.name || app?.techStack || '').trim().toLowerCase();
        return tech === 'external-exe';
    }
    getPrimaryPort(app) {
        const port = Number(app?.network?.primaryPort);
        if (!Number.isInteger(port) || port < 1 || port > 65535) {
            return null;
        }
        return port;
    }
    async ensureExternalExePortReservation(app, source) {
        if (!this.isExternalExeApp(app)) {
            return;
        }
        const port = this.getPrimaryPort(app);
        if (!port) {
            return;
        }
        try {
            const configManager = this.serviceContainer.get('configManager');
            const existing = configManager
                .getPortConfig()
                ?.reservedPorts
                ?.some(item => item?.port === port);
            if (existing) {
                return;
            }
            await configManager.addReservedPort(port, `External EXE: ${app.name}`, 'external-exe', source || 'system');
            logger.info('external-exe 端口已自动加入保留列表', {
                appId: app.id,
                appName: app.name,
                port
            });
        }
        catch (error) {
            const message = error?.message || String(error);
            if (message.includes('已被保留') || message.toLowerCase().includes('already')) {
                return;
            }
            logger.warn('自动保留 external-exe 端口失败（忽略，不影响应用创建）', {
                appId: app?.id,
                appName: app?.name,
                port,
                error: message
            });
        }
    }
    validateImportCandidates(body) {
        const candidates = Array.isArray(body?.candidates) ? body.candidates : [];
        if (candidates.length === 0) {
            throw new ApplicationError('At least one candidate is required', 'VALIDATION_ERROR');
        }
        if (candidates.length > 200) {
            throw new ApplicationError('Too many import candidates (max 200)', 'VALIDATION_ERROR');
        }
        return candidates;
    }
    async buildImportPrecheck(rawCandidates) {
        const existingApps = await this.applicationService.findAll();
        const existingByDirectory = new Map();
        const portRanges = this.getImportPortRanges();
        for (const app of existingApps) {
            existingByDirectory.set(this.normalizePath(app.directory), app);
        }
        const seenInBatch = new Set();
        const items = [];
        for (let index = 0; index < rawCandidates.length; index++) {
            const candidate = this.normalizeImportCandidate(rawCandidates[index], index);
            const duplicate = existingByDirectory.get(this.normalizePath(candidate.candidate.directory));
            if (duplicate) {
                candidate.errors.push(`目录已存在应用：${duplicate.name}`);
                candidate.duplicate = {
                    id: duplicate.id,
                    name: duplicate.name
                };
            }
            const batchKey = this.normalizePath(candidate.candidate.directory);
            if (seenInBatch.has(batchKey)) {
                candidate.errors.push('导入列表中存在重复目录');
            }
            else if (batchKey.length > 0) {
                seenInBatch.add(batchKey);
            }
            const ports = [];
            if (typeof candidate.candidate.frontendPort === 'number') {
                if (!this.isPortInRange(candidate.candidate.frontendPort, portRanges.frontend)) {
                    candidate.errors.push(`前端端口必须在 ${portRanges.frontend.start}-${portRanges.frontend.end} 范围内`);
                }
                ports.push(candidate.candidate.frontendPort);
            }
            if (typeof candidate.candidate.backendPort === 'number') {
                if (!this.isPortInRange(candidate.candidate.backendPort, portRanges.backend)) {
                    candidate.errors.push(`后端端口必须在 ${portRanges.backend.start}-${portRanges.backend.end} 范围内`);
                }
                ports.push(candidate.candidate.backendPort);
            }
            if (ports.length > 0) {
                const portConflicts = await this.checkPortConflicts(ports);
                if (portConflicts.length > 0) {
                    candidate.errors.push(`端口冲突：${portConflicts.map(c => c.port).join(', ')}`);
                    candidate.portConflicts = portConflicts;
                }
            }
            candidate.canImport = candidate.errors.length === 0;
            items.push(candidate);
        }
        const importable = items.filter(item => item.canImport).length;
        const blocked = items.length - importable;
        return {
            summary: {
                total: items.length,
                importable,
                blocked
            },
            items
        };
    }
    normalizeImportCandidate(raw, index) {
        const name = this.normalizeCandidateString(raw?.name);
        const directory = this.normalizeCandidateString(raw?.directory);
        const techStack = this.normalizeCandidateString(raw?.tech_stack || raw?.techStack);
        const description = this.normalizeCandidateString(raw?.description) || undefined;
        const icon = this.normalizeCandidateString(raw?.icon) || undefined;
        const color = this.normalizeCandidateString(raw?.color) || undefined;
        const frontendPort = this.parseOptionalPort(raw?.frontend_port ?? raw?.primaryPort);
        const backendPort = this.parseOptionalPort(raw?.backend_port ?? raw?.secondaryPort ?? raw?.backendPort);
        const errors = [];
        const warnings = [];
        if (!name) {
            errors.push('应用名称不能为空');
        }
        if (!directory) {
            errors.push('应用目录不能为空');
        }
        if (!techStack) {
            errors.push('技术栈不能为空');
        }
        if (raw?.frontend_port !== undefined && typeof frontendPort !== 'number') {
            errors.push('frontend_port 必须是有效端口（1-65535）');
        }
        if (raw?.backend_port !== undefined && typeof backendPort !== 'number') {
            errors.push('backend_port 必须是有效端口（1-65535）');
        }
        if (typeof frontendPort === 'number' && typeof backendPort === 'number' && frontendPort === backendPort) {
            warnings.push('前后端端口相同，可能导致冲突');
        }
        return {
            index,
            canImport: false,
            candidate: {
                name,
                directory,
                techStack,
                description,
                icon,
                color,
                frontendPort,
                backendPort
            },
            errors,
            warnings,
            duplicate: undefined,
            portConflicts: []
        };
    }
    normalizeCandidateString(value) {
        return typeof value === 'string' ? value.trim() : '';
    }
    parseOptionalPort(value) {
        if (value === undefined || value === null || value === '') {
            return undefined;
        }
        const parsed = Number(value);
        if (!Number.isInteger(parsed) || parsed < 1 || parsed > 65535) {
            return undefined;
        }
        return parsed;
    }
    getImportPortRanges() {
        const defaultRanges = {
            frontend: { start: 3001, end: 3100 },
            backend: { start: 8001, end: 8100 }
        };
        const configManager = this.getOptionalService('configManager');
        if (!configManager || typeof configManager.getPortConfig !== 'function') {
            return defaultRanges;
        }
        try {
            const config = configManager.getPortConfig();
            if (!config) {
                return defaultRanges;
            }
            const normalizeRange = (rawRange, fallback) => {
                const start = Number(rawRange?.start);
                const end = Number(rawRange?.end);
                if (!Number.isInteger(start) || !Number.isInteger(end) || start >= end) {
                    return fallback;
                }
                return { start, end };
            };
            return {
                frontend: normalizeRange(config.frontendRange, defaultRanges.frontend),
                backend: normalizeRange(config.backendRange, defaultRanges.backend)
            };
        }
        catch (error) {
            logger.warn('Failed to resolve import port ranges, falling back to defaults', {
                error: error?.message || String(error)
            });
            return defaultRanges;
        }
    }
    isPortInRange(port, range) {
        return Number.isInteger(port) && port >= range.start && port <= range.end;
    }
    normalizePath(path) {
        if (typeof path !== 'string') {
            return '';
        }
        const trimmed = path.trim();
        if (trimmed.length === 0) {
            return '';
        }
        try {
            const resolvedPath = normalize(resolve(trimmed));
            const strippedPath = resolvedPath.replace(/[\\/]+$/, '');
            const safePath = strippedPath.length === 0 || /^[A-Za-z]:$/.test(strippedPath)
                ? resolvedPath
                : strippedPath;
            const resolvedCanonical = safePath.replace(/\\/g, '/');
            return process.platform === 'win32'
                ? resolvedCanonical.toLowerCase()
                : resolvedCanonical;
        }
        catch {
            const fallback = trimmed.replace(/\\/g, '/').replace(/\/+$/, '');
            return process.platform === 'win32'
                ? fallback.toLowerCase()
                : fallback;
        }
    }
    async checkPortConflicts(ports) {
        const portManagementService = this.getOptionalService('portManagementService');
        if (!portManagementService || typeof portManagementService.checkConflicts !== 'function') {
            return [];
        }
        try {
            const conflicts = await portManagementService.checkConflicts(ports);
            if (!Array.isArray(conflicts)) {
                return [];
            }
            return conflicts.map((item) => ({
                port: Number(item?.port) || 0,
                reason: item?.reason || item?.details || '端口冲突',
                process: item?.process || item?.processName
            }));
        }
        catch (error) {
            logger.warn('Failed to check import port conflicts', {
                ports,
                error: error?.message || String(error)
            });
            return [];
        }
    }
    requireRoles(req, allowedRoles, operation) {
        const role = req?.auth?.role;
        if (typeof role === 'string' && allowedRoles.includes(role)) {
            return;
        }
        throw new ApplicationError('Insufficient permissions for operation', 'FORBIDDEN_OPERATION', {
            operation,
            requiredRoles: allowedRoles,
            currentRole: role || 'unknown'
        });
    }
    logLifecycleEvent(req, payload) {
        const auth = req?.auth;
        const method = req?.method || 'UNKNOWN';
        const path = req?.path || '/unknown';
        const ip = req?.ip || req?.socket?.remoteAddress || 'unknown';
        const userAgent = req?.headers?.['user-agent'];
        const details = payload?.details || {};
        const statusCode = payload.success ? 200 : 500;
        auditLogService.log({
            action: payload.action,
            userId: auth?.userId || 'anonymous',
            username: auth?.username,
            userRole: auth?.role || 'guest',
            method,
            path,
            statusCode,
            duration: 0,
            ip,
            userAgent,
            success: payload.success,
            details
        }).catch(error => {
            logger.warn('Failed to record lifecycle audit event', {
                action: payload.action,
                error: error?.message || String(error)
            });
        });
    }
    getOptionalService(serviceName) {
        if (!this.serviceContainer) {
            return null;
        }
        try {
            return this.serviceContainer.get(serviceName);
        }
        catch (error) {
            logger.warn('Service not available or failed to resolve', {
                service: serviceName,
                error: error.message
            });
            return null;
        }
    }
    /**
     * 验证Host格式的基本安全检查
     */
    isValidHost(host) {
        try {
            // 基本格式检查：不能包含危险字符
            const dangerousChars = /[<>'"\\]/;
            if (dangerousChars.test(host)) {
                return false;
            }
            // 长度检查
            if (host.length > 253) {
                return false;
            }
            // 基本格式检查：hostname:port 或 hostname
            const hostPattern = /^[a-zA-Z0-9.-]+(?::[0-9]+)?$/;
            return hostPattern.test(host);
        }
        catch (error) {
            logger.error('Error validating host format', { host, error: error.message });
            return false;
        }
    }
    /**
     * 根据请求Host生成应用访问URL
     */
    generateAppUrl(req, app, port) {
        try {
            if (!req) {
                logger.error('Request object is null or undefined in generateAppUrl');
                return `http://localhost:${port || 3000}`;
            }
            if (!port || port < 1 || port > 65535) {
                logger.warn('Invalid port number, using default', { port });
                port = 3000;
            }
            const hostname = this.getRequestHost(req);
            const protocol = this.resolveAppProtocol(app, req);
            if (!hostname || hostname.trim() === '') {
                logger.warn('Empty hostname extracted, falling back to localhost', { requestHeaders: { host: req.get('host') } });
                return `${protocol}://localhost:${port}`;
            }
            const appUrl = `${protocol}://${hostname}:${port}`;
            try {
                new URL(appUrl);
            }
            catch (urlError) {
                logger.warn('Generated URL is invalid, falling back to localhost', {
                    appUrl,
                    error: urlError.message
                });
                return `${protocol}://localhost:${port}`;
            }
            logger.debug('Generated app URL', {
                hostname,
                protocol,
                port,
                appUrl
            });
            return appUrl;
        }
        catch (error) {
            logger.error('Error generating app URL', {
                error: error.message,
                stack: error.stack,
                port,
                requestHeaders: {
                    host: req?.get?.('host'),
                    forwardedHost: req?.get?.('X-Forwarded-Host'),
                    forwardedProto: req?.get?.('X-Forwarded-Proto')
                }
            });
            // 降级到localhost
            return `http://localhost:${port || 3000}`;
        }
    }
    getRequestHost(req) {
        const manualHost = process.env.PORTAL_PUBLIC_HOST || process.env.PUBLIC_APP_HOST;
        if (manualHost && manualHost.trim().length > 0) {
            return manualHost.trim();
        }
        const headerCandidates = [
            req.get('X-Original-Host'),
            req.get('X-Forwarded-Host'),
            req.get('host')
        ].filter(Boolean);
        for (const candidate of headerCandidates) {
            const hostPart = candidate.split(',')[0]?.trim();
            if (!hostPart) {
                continue;
            }
            if (!this.isValidHost(hostPart)) {
                logger.warn('Host candidate failed validation, skipping', { header: candidate });
                continue;
            }
            try {
                const parsed = new URL(`http://${hostPart}`);
                if (parsed.hostname) {
                    return parsed.hostname;
                }
            }
            catch (error) {
                logger.warn('Invalid host header encountered, skipping', {
                    header: candidate,
                    error: error.message
                });
            }
        }
        logger.warn('No valid host header found, using localhost fallback', {
            headers: {
                original: req.get('X-Original-Host'),
                forwarded: req.get('X-Forwarded-Host'),
                host: req.get('host')
            }
        });
        return 'localhost';
    }
    prefersHttps(app) {
        try {
            const ports = new Set();
            const primary = app?.network?.primaryPort;
            if (typeof primary === 'number') {
                ports.add(primary);
            }
            if (Array.isArray(app?.network?.secondaryPorts)) {
                for (const port of app.network.secondaryPorts) {
                    if (typeof port === 'number') {
                        ports.add(port);
                    }
                }
            }
            if (Array.isArray(app?.ports)) {
                for (const item of app.ports) {
                    if (item?.protocol === 'https') {
                        return true;
                    }
                    if (typeof item?.port === 'number') {
                        ports.add(item.port);
                    }
                }
            }
            for (const port of ports) {
                if (port === 443 || port === 8443) {
                    return true;
                }
            }
            return false;
        }
        catch (error) {
            logger.warn('Failed to inspect ports for HTTPS hint', {
                error: error.message
            });
            return false;
        }
    }
    resolveAppProtocol(app, req) {
        const networkProtocol = app?.network?.protocol;
        if (networkProtocol === 'https' || networkProtocol === 'http') {
            return networkProtocol;
        }
        if (Array.isArray(app?.ports)) {
            for (const item of app.ports) {
                if (item?.protocol === 'https') {
                    return 'https';
                }
                if (item?.protocol === 'http') {
                    return 'http';
                }
            }
        }
        const httpsPreferred = this.prefersHttps(app);
        const forwardedProto = req.get('X-Forwarded-Proto');
        if (forwardedProto) {
            const proto = forwardedProto.split(',')[0]?.trim().toLowerCase();
            if (proto === 'https' && httpsPreferred) {
                return 'https';
            }
        }
        if (req.secure && httpsPreferred) {
            return 'https';
        }
        return 'http';
    }
    /**
     * Handle errors consistently
     */
    handleError(res, error, defaultMessage) {
        if (error instanceof ApplicationError) {
            const statusCode = this.getStatusCode(error.code);
            res.status(statusCode).json({
                success: false,
                error: {
                    code: error.code,
                    message: error.message,
                    context: error.context
                }
            });
        }
        else {
            // 提取更详细的错误信息
            const errorDetails = {
                message: error.message || defaultMessage,
                stack: process.env.NODE_ENV === 'development' ? error.stack : undefined,
                type: error.constructor?.name
            };
            logger.error(defaultMessage, { error: errorDetails, originalError: error });
            res.status(500).json({
                success: false,
                error: {
                    code: 'INTERNAL_ERROR',
                    message: defaultMessage,
                    details: {
                        message: error.message || '未知错误',
                        suggestion: '请检查应用配置是否正确，或查看服务器日志获取更多信息'
                    }
                }
            });
        }
    }
    getStatusCode(errorCode) {
        switch (errorCode) {
            case 'APPLICATION_NOT_FOUND': return 404;
            case 'DIRECTORY_ALREADY_EXISTS': return 409;
            case 'VALIDATION_ERROR': return 400;
            case 'PORT_CONFLICTS': return 409;
            case 'FORBIDDEN_OPERATION': return 403;
            case 'INVALID_STATE_TRANSITION': return 409;
            case 'STATE_POLICY_VIOLATION': return 409;
            case 'STOP_INCOMPLETE': return 409;
            case 'APPLICATION_DIRECTORY_NOT_FOUND': return 422;
            case 'INVALID_NETWORK_CONFIGURATION': return 422;
            default: return 500;
        }
    }
    /**
     * 清理特定端口
     */
    /**
     * 清理特定端口
     */
    async handleCleanupPort(req, res) {
        try {
            const port = parseInt(req.params.port);
            if (isNaN(port) || port < 1 || port > 65535) {
                res.status(400).json({
                    success: false,
                    error: 'Invalid port number'
                });
                return;
            }

            const portManagementService = this.serviceContainer.get('portManagementService');
            if (!portManagementService) {
                res.status(503).json({
                    success: false,
                    error: 'Port management service not available'
                });
                return;
            }

            const success = await portManagementService.forceReleasePort(port);
            res.json({
                success: true,
                data: {
                    port,
                    wasOccupied: !success, // logic might differ, but forceRelease returns true if successful
                    released: success
                },
                message: success ? `端口 ${port} 已成功释放` : `端口 ${port} 释放失败`
            });
            logger.info('Port cleanup requested via API', { port, success });
        }
        catch (error) {
            this.handleError(res, error, 'Failed to cleanup port');
        }
    }

    /**
     * 清理开发端口
     */
    async handleCleanupDevelopmentPorts(req, res) {
        try {
            const portManagementService = this.serviceContainer.get('portManagementService');
            if (!portManagementService) {
                res.status(503).json({
                    success: false,
                    error: 'Port management service not available'
                });
                return;
            }

            // Common development ports
            const commonPorts = [3000, 3001, 3021, 4000, 4001, 4016, 5173, 8080];
            const results = [];

            for (const port of commonPorts) {
                const status = await portManagementService.getPortStatus(port);
                if (status.is_listening) {
                    const success = await portManagementService.forceReleasePort(port);
                    results.push({ port, success });
                }
            }

            const totalAttempted = results.length;
            const totalCleaned = results.filter(r => r.success).length;

            res.json({
                success: true,
                data: {
                    results,
                    totalCleaned,
                    totalAttempted
                },
                message: `清理了 ${totalCleaned}/${totalAttempted} 个开发端口`
            });
            logger.info('Development ports cleanup requested via API', {
                totalAttempted,
                totalCleaned
            });
        }
        catch (error) {
            this.handleError(res, error, 'Failed to cleanup development ports');
        }
    }

    /**
     * 检查端口状态
     */
    async handleGetPortStatus(req, res) {
        try {
            const port = parseInt(req.params.port);
            if (isNaN(port) || port < 1 || port > 65535) {
                res.status(400).json({
                    success: false,
                    error: 'Invalid port number'
                });
                return;
            }

            const portManagementService = this.serviceContainer.get('portManagementService');
            if (!portManagementService) {
                res.status(503).json({
                    success: false,
                    error: 'Port management service not available'
                });
                return;
            }

            const status = await portManagementService.getPortStatus(port);
            res.json({
                success: true,
                data: {
                    port,
                    occupied: status.is_listening || status.status === 'allocated',
                    status: status.status,
                    details: status
                }
            });
            logger.info('Port status checked via API', { port, status: status.status });
        }
        catch (error) {
            this.handleError(res, error, 'Failed to check port status');
        }
    }
    /**
     * 端口范围扫描 - v2 API
     * POST /api/v2/applications/ports/scan/range
     */
    async handleScanPortRange(req, res) {
        try {
            const { startPort, endPort } = req.body;

            // 验证输入
            if (!startPort || !endPort || startPort < 1 || endPort > 65535 || startPort > endPort) {
                res.status(400).json({
                    success: false,
                    error: 'Invalid port range'
                });
                return;
            }

            const portManagementService = this.serviceContainer.get('portManagementService');
            if (!portManagementService) {
                res.status(503).json({
                    success: false,
                    error: 'Port management service not available'
                });
                return;
            }

            // 执行扫描
            const scanResults = await portManagementService.scanPortRange(startPort, endPort);
            const portRange = endPort - startPort + 1;
            const activePortsFound = scanResults.filter((r) => ['listening', 'allocated', 'open'].includes(r.status)).length;

            res.json({
                success: true,
                data: scanResults,
                message: `Scanned ${portRange} ports, found ${activePortsFound} active ports`,
                metadata: {
                    scanRange: { startPort, endPort },
                    totalPortsScanned: portRange,
                    activePortsFound
                }
            });
        }
        catch (error) {
            logger.error('Port scan failed', { error, body: req.body });
            this.handleError(res, error, 'Port scan failed');
        }
    }
    /**
     * 验证应用配置
     * GET /api/v2/applications/:id/config/validate
     */
    async handleValidateConfig(req, res) {
        try {
            const { id } = req.params;
            // 获取应用信息
            const app = await this.applicationService.findById(id);
            if (!app) {
                res.status(404).json({
                    success: false,
                    error: 'Application not found'
                });
                return;
            }
            // 获取应用端口信息
            const frontendPort = app.network.primaryPort;
            const backendPort = app.network.secondaryPorts?.[0];
            if (!backendPort) {
                res.status(400).json({
                    success: false,
                    error: 'Application does not have a backend port configured'
                });
                return;
            }
            // 验证配置
            const validationResult = await this.configValidator.validateAppConfig(app.directory, { frontend: frontendPort, backend: backendPort });
            logger.info('应用配置验证完成', {
                appId: id,
                appName: app.name,
                valid: validationResult.valid,
                issuesCount: validationResult.issues.length
            });
            res.json({
                success: true,
                data: {
                    valid: validationResult.valid,
                    issues: validationResult.issues,
                    configFiles: validationResult.configFiles,
                    summary: {
                        total: validationResult.issues.length,
                        errors: validationResult.issues.filter(i => i.type === 'error').length,
                        warnings: validationResult.issues.filter(i => i.type === 'warning').length,
                        infos: validationResult.issues.filter(i => i.type === 'info').length,
                        autoFixable: validationResult.issues.filter(i => i.autoFixable).length
                    }
                }
            });
        }
        catch (error) {
            logger.error('配置验证失败', { error, appId: req.params.id });
            this.handleError(res, error, 'Failed to validate application configuration');
        }
    }
    /**
     * 修复应用配置
     * POST /api/v2/applications/:id/config/fix
     */
    async handleFixConfig(req, res) {
        try {
            const { id } = req.params;
            const { createBackup = true } = req.body;
            // 获取应用信息
            const app = await this.applicationService.findById(id);
            if (!app) {
                res.status(404).json({
                    success: false,
                    error: 'Application not found'
                });
                return;
            }
            // 获取应用端口信息
            const frontendPort = app.network.primaryPort;
            const backendPort = app.network.secondaryPorts?.[0];
            if (!backendPort) {
                res.status(400).json({
                    success: false,
                    error: 'Application does not have a backend port configured'
                });
                return;
            }
            // 先验证配置,找出问题
            const validationResult = await this.configValidator.validateAppConfig(app.directory, { frontend: frontendPort, backend: backendPort });
            if (validationResult.issues.length === 0) {
                res.json({
                    success: true,
                    message: 'No issues found, nothing to fix',
                    data: {
                        fixed: [],
                        failed: []
                    }
                });
                return;
            }
            // 修复问题
            const fixResult = await this.configFixer.fixIssues(validationResult.issues, createBackup);
            logger.info('应用配置修复完成', {
                appId: id,
                appName: app.name,
                success: fixResult.success,
                fixedCount: fixResult.fixed.length,
                failedCount: fixResult.failed.length
            });
            res.json({
                success: fixResult.success,
                message: fixResult.message,
                data: {
                    fixed: fixResult.fixed,
                    failed: fixResult.failed,
                    backupPath: fixResult.backupPath,
                    summary: {
                        totalIssues: validationResult.issues.length,
                        fixedCount: fixResult.fixed.length,
                        failedCount: fixResult.failed.length
                    }
                }
            });
        }
        catch (error) {
            logger.error('配置修复失败', { error, appId: req.params.id });
            this.handleError(res, error, 'Failed to fix application configuration');
        }
    }
    /**
     * Check for port conflicts
     * POST /api/v2/applications/ports/check-conflicts
     */
    async handleCheckPortConflicts(req, res) {
        try {
            const { ports } = req.body;
            if (!Array.isArray(ports)) {
                res.status(400).json({
                    success: false,
                    error: 'Ports must be an array of numbers'
                });
                return;
            }
            const normalizedPorts = ports
                .map((port) => Number(port))
                .filter((port) => Number.isInteger(port) && port > 0 && port <= 65535);
            if (normalizedPorts.length !== ports.length) {
                res.status(400).json({
                    success: false,
                    error: 'Each port must be an integer between 1 and 65535'
                });
                return;
            }
            const portManagementService = this.serviceContainer.get('portManagementService');
            if (!portManagementService) {
                res.status(503).json({
                    success: false,
                    error: 'Port management service not available'
                    });
                return;
            }
            const conflicts = await portManagementService.checkConflicts(normalizedPorts);
            const normalizedConflicts = Array.isArray(conflicts)
                ? conflicts
                    .map((item) => ({
                    port: Number(item?.port),
                    reason: item?.reason || item?.details || '端口冲突',
                    process: item?.process || item?.processName
                }))
                    .filter((item) => Number.isInteger(item.port) && item.port > 0)
                : [];
            res.json({
                success: true,
                data: {
                    hasConflicts: normalizedConflicts.length > 0,
                    conflicts: normalizedConflicts
                },
                // 兼容旧调用方：保留顶层 conflicts 字段
                conflicts: normalizedConflicts,
                message: normalizedConflicts.length > 0 ? `Found ${normalizedConflicts.length} conflicts` : 'No conflicts found'
            });
        }
        catch (error) {
            this.handleError(res, error, 'Failed to check port conflicts');
        }
    }
    getRouter() {
        return this.router;
    }
}
//# sourceMappingURL=ApplicationsController.js.map
