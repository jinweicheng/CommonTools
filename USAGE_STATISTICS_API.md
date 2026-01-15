# 📊 使用统计 API 文档

## 概述

前端会自动收集用户使用情况并上报到后端API。后端需要实现以下API接口来接收统计数据。

---

## API 端点

### POST `/api/statistics/usage`

上报用户使用统计数据。

#### 请求头

```
Content-Type: application/json
```

#### 请求体

```json
{
  "userId": "550e8400-e29b-41d4-a716-446655440000",
  "statistics": [
    {
      "module": "watermark",
      "action": "upload",
      "endpoint": "/tools/watermark",
      "ipAddress": null,
      "userAgent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36...",
      "deviceType": "PC",
      "browser": "Chrome",
      "os": "Windows 10/11",
      "statDate": "2026-01-13 14:30:25"
    }
  ]
}
```

#### 字段说明

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| userId | string | 是 | 用户UUID（前端自动生成并保存到localStorage） |
| statistics | array | 是 | 统计数据数组 |
| statistics[].module | string | 是 | 模块名称：`watermark`, `conversion`, `signature`, `compression`, `heic-to-jpg`, `password-manager`, `pages` 等 |
| statistics[].action | string | 是 | 操作名称：`upload`, `download`, `preview`, `view`, `create`, `update`, `delete` 等 |
| statistics[].endpoint | string | 是 | API端点路径，如 `/tools/watermark` |
| statistics[].ipAddress | string\|null | 否 | IP地址（前端传null，后端从请求头获取） |
| statistics[].userAgent | string | 否 | 用户代理字符串 |
| statistics[].deviceType | string | 否 | 设备类型：`PC`, `MOBILE`, `TABLET`, `UNKNOWN` |
| statistics[].browser | string | 否 | 浏览器：`Chrome`, `Firefox`, `Safari`, `Edge` 等 |
| statistics[].os | string | 否 | 操作系统：`Windows 10/11`, `macOS`, `Linux`, `Android`, `iOS` 等 |
| statistics[].statDate | string | 是 | 统计日期时间，格式：`YYYY-MM-DD HH:mm:ss` |

#### 响应

**成功响应 (200 OK)**

```json
{
  "success": true,
  "message": "Statistics recorded successfully",
  "recorded": 1
}
```

**错误响应 (400 Bad Request)**

```json
{
  "success": false,
  "error": "Invalid request data",
  "details": "..."
}
```

---

## 后端实现示例

### Node.js/Express 示例

```javascript
const express = require('express');
const router = express.Router();

// 获取客户端真实IP
function getClientIP(req) {
  return req.headers['x-forwarded-for']?.split(',')[0]?.trim() ||
         req.headers['x-real-ip'] ||
         req.connection.remoteAddress ||
         req.socket.remoteAddress ||
         '0.0.0.0';
}

router.post('/statistics/usage', async (req, res) => {
  try {
    const { userId, statistics } = req.body;
    const clientIP = getClientIP(req);

    if (!userId || !Array.isArray(statistics) || statistics.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'Invalid request data'
      });
    }

    // 处理每条统计数据
    const records = statistics.map(stat => ({
      user_id: userId, // 注意：数据库字段是 user_id，但前端传的是 userId
      module: stat.module,
      action: stat.action,
      endpoint: stat.endpoint,
      ip_address: stat.ipAddress || clientIP, // 使用后端获取的真实IP
      user_agent: stat.userAgent || req.headers['user-agent'],
      device_type: stat.deviceType || 'UNKNOWN',
      browser: stat.browser || null,
      os: stat.os || null,
      stat_date: stat.statDate, // 格式：YYYY-MM-DD HH:mm:ss
      count: 1
    }));

    // 批量插入或更新数据库
    // 注意：由于有 UNIQUE KEY，需要使用 INSERT ... ON DUPLICATE KEY UPDATE
    for (const record of records) {
      await db.query(`
        INSERT INTO usage_statistics 
        (user_id, module, action, endpoint, ip_address, user_agent, device_type, browser, os, stat_date, count)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON DUPLICATE KEY UPDATE 
          count = count + 1,
          ip_address = VALUES(ip_address),
          user_agent = VALUES(user_agent)
      `, [
        record.user_id,
        record.module,
        record.action,
        record.endpoint,
        record.ip_address,
        record.user_agent,
        record.device_type,
        record.browser,
        record.os,
        record.stat_date,
        record.count
      ]);
    }

    res.json({
      success: true,
      message: 'Statistics recorded successfully',
      recorded: records.length
    });
  } catch (error) {
    console.error('Failed to record statistics:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error'
    });
  }
});

module.exports = router;
```

### Python/Flask 示例

```python
from flask import Flask, request, jsonify
from datetime import datetime
import mysql.connector

app = Flask(__name__)

def get_client_ip():
    """获取客户端真实IP"""
    if request.headers.get('X-Forwarded-For'):
        return request.headers.get('X-Forwarded-For').split(',')[0].strip()
    elif request.headers.get('X-Real-IP'):
        return request.headers.get('X-Real-IP')
    else:
        return request.remote_addr

@app.route('/api/statistics/usage', methods=['POST'])
def record_statistics():
    try:
        data = request.json
        userId = data.get('userId')
        statistics = data.get('statistics', [])
        
        if not userId or not statistics:
            return jsonify({
                'success': False,
                'error': 'Invalid request data'
            }), 400
        
        client_ip = get_client_ip()
        user_agent = request.headers.get('User-Agent', '')
        
        # 连接数据库
        db = mysql.connector.connect(
            host='localhost',
            user='your_user',
            password='your_password',
            database='your_database'
        )
        cursor = db.cursor()
        
        # 批量插入或更新
        for stat in statistics:
            sql = """
                INSERT INTO usage_statistics 
                (user_id, module, action, endpoint, ip_address, user_agent, device_type, browser, os, stat_date, count)
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
                ON DUPLICATE KEY UPDATE 
                    count = count + 1,
                    ip_address = VALUES(ip_address),
                    user_agent = VALUES(user_agent)
            """
            values = (
                userId,
                stat.get('module'),
                stat.get('action'),
                stat.get('endpoint'),
                stat.get('ipAddress') or client_ip,
                stat.get('userAgent') or user_agent,
                stat.get('deviceType', 'UNKNOWN'),
                stat.get('browser'),
                stat.get('os'),
                stat.get('statDate'),  # 格式：YYYY-MM-DD HH:mm:ss
                1
            )
            cursor.execute(sql, values)
        
        db.commit()
        cursor.close()
        db.close()
        
        return jsonify({
            'success': True,
            'message': 'Statistics recorded successfully',
            'recorded': len(statistics)
        })
        
    except Exception as e:
        print(f'Error recording statistics: {e}')
        return jsonify({
            'success': False,
            'error': 'Internal server error'
        }), 500
```

---

## 数据库表结构

```sql
CREATE TABLE IF NOT EXISTS `usage_statistics` (
    `id` BIGINT NOT NULL AUTO_INCREMENT COMMENT '统计ID',
    `user_id` VARCHAR(36) NOT NULL COMMENT '用户ID（UUID）',
    `module` VARCHAR(50) NOT NULL COMMENT '模块名称：files, passwords, feedback, users等',
    `action` VARCHAR(50) NOT NULL COMMENT '操作名称：upload, download, create, update, delete, list, view等',
    `endpoint` VARCHAR(200) NOT NULL COMMENT 'API端点路径',
    `ip_address` VARCHAR(50) DEFAULT NULL COMMENT 'IP地址',
    `user_agent` VARCHAR(500) DEFAULT NULL COMMENT '用户代理（User-Agent）',
    `device_type` VARCHAR(20) DEFAULT NULL COMMENT '设备类型：PC, MOBILE, TABLET, UNKNOWN',
    `browser` VARCHAR(50) DEFAULT NULL COMMENT '浏览器：Chrome, Firefox, Safari等',
    `os` VARCHAR(50) DEFAULT NULL COMMENT '操作系统：Windows, macOS, Linux, iOS, Android等',
    `stat_date` DATETIME NOT NULL COMMENT '统计日期时间（YYYY-MM-DD HH:mm:ss）',
    `count` INT NOT NULL DEFAULT 1 COMMENT '访问次数',
    `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
    PRIMARY KEY (`id`),
    UNIQUE KEY `uk_user_module_action_date` (`user_id`, `module`, `action`, `stat_date`),
    KEY `idx_user_id` (`user_id`),
    KEY `idx_module` (`module`),
    KEY `idx_action` (`action`),
    KEY `idx_stat_date` (`stat_date`),
    KEY `idx_module_action` (`module`, `action`),
    KEY `idx_ip_address` (`ip_address`),
    KEY `idx_device_type` (`device_type`),
    KEY `idx_created_at` (`created_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='使用统计表';
```

**重要变更**：
- `user_id` 字段类型改为 `VARCHAR(36)`，因为前端使用的是UUID字符串
- `stat_date` 字段类型改为 `DATETIME`，存储完整的日期时间（YYYY-MM-DD HH:mm:ss）
- 移除了 `stat_hour` 字段（不再需要，因为stat_date已包含时间信息）
- `UNIQUE KEY` 已更新，去掉了 `stat_hour` 字段
- 移除了外键约束（因为前端生成的UUID不在users表中）
- 如果确实需要外键，需要先在前端注册用户时创建对应的users记录

---

## 前端统计触发点

### 自动统计

1. **页面访问**：路由变化时自动记录
   - 模块：`pages`
   - 操作：`view`
   - 路径：当前路由路径

### 手动统计（已实现）

1. **PDF水印工具**：
   - 文件上传：`trackFileUpload('watermark', fileType)`
   - 生成预览：`trackUsage('watermark', 'preview')`
   - 文件下载：`trackFileDownload('watermark', fileType)`

### 需要添加统计的其他工具

在其他组件中添加类似的统计调用：

```typescript
import { trackFileUpload, trackFileDownload, trackUsage } from '../utils/usageStatisticsService'

// 文件上传时
trackFileUpload('conversion', 'pdf')

// 文件下载时
trackFileDownload('signature', 'pdf')

// 其他操作
trackUsage('compression', 'compress', '/tools/compression')
```

---

## 注意事项

1. **用户ID管理**：
   - 前端自动生成UUID并保存到localStorage
   - 同一浏览器会使用相同的UUID
   - 清除浏览器数据会生成新的UUID

2. **批量上报**：
   - 前端使用队列批量上报，每5秒刷新一次
   - 队列达到50条时立即上报
   - 页面卸载时自动刷新队列

3. **错误处理**：
   - 统计失败不影响用户操作
   - 所有错误静默处理，不显示给用户

4. **IP地址**：
   - 前端无法获取真实IP，传null
   - 后端需要从请求头（`X-Forwarded-For`, `X-Real-IP`）获取

5. **性能优化**：
   - 使用 `keepalive: true` 确保请求在页面卸载后也能完成
   - 异步上报，不阻塞用户操作

---

## 测试

### 测试统计上报

1. 打开浏览器开发者工具（F12）
2. 进入 Network 标签
3. 执行操作（上传文件、下载文件等）
4. 查看是否有 `/api/statistics/usage` 请求
5. 检查请求体和响应

### 验证用户ID

```javascript
// 在浏览器控制台执行
import { getUserId } from './utils/userIdService'
console.log('User ID:', getUserId())
```

---

## 数据查询示例

### 查询某个用户的使用情况

```sql
SELECT 
    module,
    action,
    COUNT(*) as total_count,
    SUM(count) as total_operations
FROM usage_statistics
WHERE user_id = '550e8400-e29b-41d4-a716-446655440000'
GROUP BY module, action
ORDER BY total_operations DESC;
```

### 查询某个模块的使用统计

```sql
SELECT 
    DATE(stat_date) as stat_date,
    HOUR(stat_date) as stat_hour,
    COUNT(DISTINCT user_id) as unique_users,
    SUM(count) as total_operations
FROM usage_statistics
WHERE module = 'watermark'
GROUP BY DATE(stat_date), HOUR(stat_date)
ORDER BY stat_date DESC, stat_hour DESC;
```

或者按完整日期时间查询：

```sql
SELECT 
    stat_date,
    COUNT(DISTINCT user_id) as unique_users,
    SUM(count) as total_operations
FROM usage_statistics
WHERE module = 'watermark'
GROUP BY stat_date
ORDER BY stat_date DESC;
```

### 查询设备类型分布

```sql
SELECT 
    device_type,
    COUNT(DISTINCT user_id) as unique_users,
    SUM(count) as total_operations
FROM usage_statistics
GROUP BY device_type;
```
