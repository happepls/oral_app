"""
Redis Cache Utility for Workflow Service
提供用户信息的缓存功能，减少数据库查询延迟
"""
import redis
import json
import os
import logging
from typing import Optional, Dict, Any
from functools import wraps
import time

logger = logging.getLogger(__name__)

# Redis配置
REDIS_HOST = os.getenv('REDIS_HOST', 'redis')
REDIS_PORT = int(os.getenv('REDIS_PORT', 6379))
REDIS_DB = int(os.getenv('REDIS_DB', 0))
REDIS_PASSWORD = os.getenv('REDIS_PASSWORD', None)

# 缓存过期时间（秒）
CACHE_TTL_USER_INFO = 3600  # 用户信息缓存1小时
CACHE_TTL_USER_LANGUAGE = 7200  # 用户语言设置缓存2小时


class RedisCache:
    """Redis缓存管理器"""
    
    def __init__(self):
        self._client = None
        self._connected = False
    
    def connect(self):
        """连接Redis服务器"""
        if self._client is not None:
            return self._client
        
        try:
            self._client = redis.Redis(
                host=REDIS_HOST,
                port=REDIS_PORT,
                db=REDIS_DB,
                password=REDIS_PASSWORD,
                decode_responses=True,
                socket_connect_timeout=5,
                socket_timeout=5,
                health_check_interval=30
            )
            # 测试连接
            self._client.ping()
            self._connected = True
            logger.info(f"[Redis] Connected to Redis at {REDIS_HOST}:{REDIS_PORT}")
            return self._client
        except Exception as e:
            logger.warning(f"[Redis] Failed to connect to Redis: {e}. Will use database fallback.")
            self._connected = False
            return None
    
    @property
    def client(self):
        """获取Redis客户端，自动连接"""
        if self._client is None:
            return self.connect()
        return self._client
    
    def is_connected(self) -> bool:
        """检查Redis连接状态"""
        if self._client is None:
            return False
        try:
            self._client.ping()
            return True
        except:
            return False
    
    def get_user_info(self, user_id: str) -> Optional[Dict[str, Any]]:
        """
        从缓存获取用户信息
        
        Args:
            user_id: 用户ID
            
        Returns:
            用户信息字典，如果不存在返回None
        """
        if not self.is_connected():
            return None
        
        try:
            key = f"user:info:{user_id}"
            data = self._client.get(key)
            if data:
                logger.debug(f"[Redis] Cache hit for user {user_id}")
                return json.loads(data)
            logger.debug(f"[Redis] Cache miss for user {user_id}")
            return None
        except Exception as e:
            logger.warning(f"[Redis] Error getting user info from cache: {e}")
            return None
    
    def set_user_info(self, user_id: str, user_info: Dict[str, Any], ttl: int = CACHE_TTL_USER_INFO):
        """
        缓存用户信息
        
        Args:
            user_id: 用户ID
            user_info: 用户信息字典
            ttl: 过期时间（秒）
        """
        if not self.is_connected():
            return
        
        try:
            key = f"user:info:{user_id}"
            self._client.setex(key, ttl, json.dumps(user_info))
            logger.debug(f"[Redis] Cached user info for {user_id}, TTL={ttl}s")
        except Exception as e:
            logger.warning(f"[Redis] Error setting user info cache: {e}")
    
    def get_user_language(self, user_id: str) -> Optional[str]:
        """
        从缓存获取用户母语设置
        
        Args:
            user_id: 用户ID
            
        Returns:
            用户母语代码，如果不存在返回None
        """
        if not self.is_connected():
            return None
        
        try:
            key = f"user:language:{user_id}"
            language = self._client.get(key)
            if language:
                logger.debug(f"[Redis] Language cache hit for user {user_id}")
                return language
            logger.debug(f"[Redis] Language cache miss for user {user_id}")
            return None
        except Exception as e:
            logger.warning(f"[Redis] Error getting user language from cache: {e}")
            return None
    
    def set_user_language(self, user_id: str, language: str, ttl: int = CACHE_TTL_USER_LANGUAGE):
        """
        缓存用户母语设置
        
        Args:
            user_id: 用户ID
            language: 母语代码
            ttl: 过期时间（秒）
        """
        if not self.is_connected():
            return
        
        try:
            key = f"user:language:{user_id}"
            self._client.setex(key, ttl, language)
            logger.debug(f"[Redis] Cached user language for {user_id}: {language}, TTL={ttl}s")
        except Exception as e:
            logger.warning(f"[Redis] Error setting user language cache: {e}")
    
    def invalidate_user(self, user_id: str):
        """
        清除用户缓存（用于用户信息更新时）
        
        Args:
            user_id: 用户ID
        """
        if not self.is_connected():
            return
        
        try:
            # 删除用户相关的所有缓存
            keys = self._client.keys(f"user:*:{user_id}")
            if keys:
                self._client.delete(*keys)
                logger.info(f"[Redis] Invalidated cache for user {user_id}, keys={len(keys)}")
        except Exception as e:
            logger.warning(f"[Redis] Error invalidating user cache: {e}")
    
    def get_cache_stats(self) -> Dict[str, Any]:
        """获取缓存统计信息"""
        if not self.is_connected():
            return {"connected": False}
        
        try:
            info = self._client.info()
            return {
                "connected": True,
                "used_memory_human": info.get("used_memory_human", "N/A"),
                "connected_clients": info.get("connected_clients", 0),
                "total_keys": self._client.dbsize()
            }
        except Exception as e:
            logger.warning(f"[Redis] Error getting cache stats: {e}")
            return {"connected": False, "error": str(e)}


# 全局缓存实例
cache = RedisCache()


async def get_user_language_with_cache(user_id: str, db_connection, cache_instance: RedisCache = None) -> str:
    """
    获取用户母语，优先从缓存读取，缓存未命中则查询数据库
    
    Args:
        user_id: 用户ID
        db_connection: 数据库连接
        cache_instance: 缓存实例（可选，默认使用全局实例）
        
    Returns:
        用户母语代码，默认为"English"
    """
    cache_mgr = cache_instance or cache
    
    # 1. 尝试从缓存获取
    cached_language = cache_mgr.get_user_language(user_id)
    if cached_language:
        return cached_language
    
    # 2. 缓存未命中，查询数据库
    try:
        user = await db_connection.fetchrow(
            "SELECT native_language FROM users WHERE id = $1",
            user_id
        )
        native_language = user["native_language"] if user and user["native_language"] else "English"
        
        # 3. 写入缓存
        cache_mgr.set_user_language(user_id, native_language)
        
        return native_language
    except Exception as e:
        logger.error(f"[Cache] Error fetching user language from DB: {e}")
        return "English"


def cached(ttl: int = 3600, key_prefix: str = "cache"):
    """
    装饰器：缓存函数结果
    
    Args:
        ttl: 缓存过期时间（秒）
        key_prefix: 缓存键前缀
    """
    def decorator(func):
        @wraps(func)
        async def wrapper(*args, **kwargs):
            # 生成缓存键
            cache_key = f"{key_prefix}:{func.__name__}:{hash(str(args) + str(kwargs))}"
            
            # 尝试从缓存获取
            if cache.is_connected():
                try:
                    cached_data = cache.client.get(cache_key)
                    if cached_data:
                        return json.loads(cached_data)
                except Exception as e:
                    logger.warning(f"[Cache] Error reading cache: {e}")
            
            # 执行函数
            result = await func(*args, **kwargs)
            
            # 写入缓存
            if cache.is_connected() and result is not None:
                try:
                    cache.client.setex(cache_key, ttl, json.dumps(result))
                except Exception as e:
                    logger.warning(f"[Cache] Error writing cache: {e}")
            
            return result
        return wrapper
    return decorator
