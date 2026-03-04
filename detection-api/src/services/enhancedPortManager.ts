/**
 * Enhanced Port Manager
 * 
 * Re-exports PortManagementService as EnhancedPortManager for backwards compatibility.
 * This file exists to maintain compatibility with modules that import EnhancedPortManager.
 */

import { PortManagementService } from './PortManagementService';

// Re-export PortManagementService as EnhancedPortManager for compatibility
export { PortManagementService as EnhancedPortManager };

// Also export all types from PortManagementService
export * from './PortManagementService';
