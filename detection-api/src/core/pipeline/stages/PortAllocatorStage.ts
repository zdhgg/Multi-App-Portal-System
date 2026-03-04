/**
 * PortAllocatorStage - 端口分配阶段
 * 
 * 负责为每个项目分配端口，处理冲突检测
 * 支持从用户配置读取保留端口和端口范围
 */

import { PipelineStage } from '../PipelineStage'
import { ScanContext, AggregatedProject } from '../ScanContext'
import { logger } from '../../../utils/logger'

/**
 * 端口范围配置
 */
interface PortRange {
  start: number
  end: number
}

export class PortAllocatorStage extends PipelineStage {
  readonly name = 'PortAllocator'
  
  private allocatedPorts = new Set<number>()
  private projectIndex = 0
  private portRanges: { frontend: PortRange; backend: PortRange; main: PortRange } = {
    frontend: { start: 3001, end: 3100 },
    backend: { start: 8001, end: 8100 },
    main: { start: 3001, end: 3100 }
  }
  
  protected async process(context: ScanContext): Promise<void> {
    const { aggregatedProjects } = context.results
    const { portAllocation } = context.config
    
    // 如果禁用端口分配，跳过
    if (!portAllocation.enabled) {
      logger.info('[PortAllocator] 端口分配已禁用，跳过')
      return
    }
    
    // 从配置读取端口范围
    this.portRanges = {
      frontend: portAllocation.frontendRange,
      backend: portAllocation.backendRange,
      main: portAllocation.frontendRange // main 使用前端范围
    }
    
    // 初始化已分配端口集合（包含保留端口和已分配端口）
    this.allocatedPorts = new Set<number>([
      ...portAllocation.reservedPorts,
      ...portAllocation.allocatedPorts
    ])
    
    const initialReservedCount = this.allocatedPorts.size
    
    logger.info('[PortAllocator] 开始分配端口', {
      projectCount: aggregatedProjects.length,
      strategy: portAllocation.strategy,
      frontendRange: `${this.portRanges.frontend.start}-${this.portRanges.frontend.end}`,
      backendRange: `${this.portRanges.backend.start}-${this.portRanges.backend.end}`,
      reservedPorts: portAllocation.reservedPorts.length,
      allocatedPorts: portAllocation.allocatedPorts.length
    })
    
    this.projectIndex = 0
    
    // 为每个项目分配端口
    for (const project of aggregatedProjects) {
      this.allocatePortsForProject(project)
    }
    
    logger.info('[PortAllocator] 端口分配完成', {
      totalAllocated: this.allocatedPorts.size - initialReservedCount
    })
  }
  
  /**
   * 为项目分配端口
   */
  private allocatePortsForProject(project: AggregatedProject): void {
    if (project.type === 'fullstack') {
      // 全栈项目分配前后端端口
      const frontendPort = this.allocatePort('frontend')
      const backendPort = this.allocatePort('backend')
      
      project.ports = {
        frontend: frontendPort,
        backend: backendPort
      }
      
      // 更新全栈信息中的端口
      if (project.fullStackInfo) {
        project.fullStackInfo.frontend = {
          ...project.fullStackInfo.frontend,
          // 不修改原有属性，只记录分配的端口
        }
        project.fullStackInfo.backend = {
          ...project.fullStackInfo.backend,
        }
      }
      
      logger.debug('[PortAllocator] 分配全栈项目端口', {
        project: project.name,
        frontend: frontendPort,
        backend: backendPort
      })
      
    } else {
      // 单体项目分配主端口
      const portType = project.type === 'backend' ? 'backend' : 'frontend'
      const mainPort = this.allocatePort(portType)
      
      project.ports = {
        main: mainPort
      }
      
      logger.debug('[PortAllocator] 分配单体项目端口', {
        project: project.name,
        type: project.type,
        port: mainPort
      })
    }
    
    this.projectIndex++
  }
  
  /**
   * 分配端口
   */
  private allocatePort(type: 'frontend' | 'backend' | 'main'): number {
    const range = this.portRanges[type]
    
    // 基于项目索引计算基础端口
    const basePort = range.start + (this.projectIndex * 10)
    
    // 查找可用端口
    for (let port = basePort; port <= range.end; port++) {
      if (!this.allocatedPorts.has(port)) {
        this.allocatedPorts.add(port)
        return port
      }
    }
    
    // 如果范围内没有可用端口，从头开始找
    for (let port = range.start; port <= range.end; port++) {
      if (!this.allocatedPorts.has(port)) {
        this.allocatedPorts.add(port)
        return port
      }
    }
    
    // 实在没有可用端口，使用一个大端口
    const fallbackPort = 10000 + this.projectIndex
    this.allocatedPorts.add(fallbackPort)
    
    logger.warn('[PortAllocator] 端口范围已满，使用备用端口', {
      type,
      fallbackPort
    })
    
    return fallbackPort
  }
  
  protected getStageStats(context: ScanContext): Record<string, any> {
    const projects = context.results.aggregatedProjects
    const fullstackCount = projects.filter(p => p.type === 'fullstack').length
    const { portAllocation } = context.config
    const initialReservedCount = portAllocation.reservedPorts.length + portAllocation.allocatedPorts.length
    
    return {
      totalPorts: this.allocatedPorts.size - initialReservedCount,
      fullstackPorts: fullstackCount * 2,
      singlePorts: projects.length - fullstackCount
    }
  }
}
