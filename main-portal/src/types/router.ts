// 扩展Vue Router的路由元信息类型
declare module 'vue-router' {
  interface RouteMeta {
    // 页面标题
    title?: string
    
    // 认证相关
    requiresAuth?: boolean    // 是否需要认证
    requiresAdmin?: boolean   // 是否需要管理员权限
    allowGuests?: boolean     // 是否允许访客访问
    
    // 页面配置
    layout?: string          // 布局组件名称
    keepAlive?: boolean      // 是否缓存页面
    showInMenu?: boolean     // 是否在菜单中显示
    
    // 权限相关
    permissions?: string[]   // 所需权限列表
    roles?: string[]         // 所需角色列表
    
    // 页面元数据
    icon?: string           // 页面图标
    description?: string    // 页面描述
    keywords?: string[]     // 页面关键词
    
    // 导航相关
    breadcrumb?: Array<{    // 面包屑导航
      title: string
      path?: string
    }>
    
    // 缓存相关
    cacheKey?: string       // 缓存键名
    cacheTTL?: number       // 缓存生存时间（秒）
    
    // 页面行为
    requiresConfirm?: boolean  // 离开页面时是否需要确认
    scrollToTop?: boolean      // 进入页面时是否滚动到顶部
    
    // 元数据
    createdAt?: string      // 路由创建时间
    updatedAt?: string      // 路由更新时间
    version?: string        // 路由版本
  }

  // Ensure these composition API helpers are available in type system
  // Some environments of vue-tsc might not pick up correct types
  // We declare them with broad types to satisfy the compiler.
  export function useRouter(): any
  export function useRoute(): any
}