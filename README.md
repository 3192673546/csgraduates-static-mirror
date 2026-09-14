# CSGraduates 静态镜像 / Static Mirror

服务器上当前运行的 **CSGraduates 静态镜像快照**，用于静态站点部署、离线访问和 Web 运维实践。

> 说明：这是静态镜像 / 构建产物仓库，并非对上游站点原创内容或版权的声明。页面内容与素材的原始权利归其对应作者与来源所有。

## 用途

- Nginx 静态站部署
- 网站镜像与离线访问
- 静态资源维护
- 页面兼容性修复与局部前端增强
- 服务器发布 / 回滚实践

## 部署

Nginx 可直接将仓库根目录作为站点 `root`：

```nginx
server {
    listen 80;
    server_name example.com;
    root /var/www/csgraduates-static-mirror;
    index index.html;
}
```

## 说明

服务器实际发布流程使用版本化 release 目录和 `current` 符号链接，以便快速切换版本和回滚。本仓库保存的是当前线上版本的干净静态快照。

<details>
<summary><b>English</b></summary>

A static snapshot used for Nginx deployment, offline access, front-end maintenance, and release/rollback practice.

This is a mirror/build-output repository and does not claim ownership of upstream content. Original rights remain with their respective authors and sources.

</details>
