# 内置开源中文字体

字体来自 Google Fonts 官方仓库 https://github.com/google/fonts/tree/main/ofl ，于 2026-10-23 获取。保留原始 TTF，不裁字，不依赖运行时 CDN。各字体适用 SIL Open Font License 1.1，原始版权声明及完整条款见同目录对应的 `*-OFL.txt`。允许随应用分发和用于视频作品；重新分发字体时须保留许可证并遵守保留字体名等条款。

| 文件 | 官方来源目录 | 许可证 |
| --- | --- | --- |
| NotoSansSC.ttf | ofl/notosanssc/NotoSansSC[wght].ttf | notosanssc-OFL.txt |
| ZCOOLXiaoWei.ttf | ofl/zcoolxiaowei/ZCOOLXiaoWei-Regular.ttf | zcoolxiaowei-OFL.txt |
| ZCOOLKuaiLe.ttf | ofl/zcoolkuaile/ZCOOLKuaiLe-Regular.ttf | zcoolkuaile-OFL.txt |
| ZCOOLQingKeHuangYou.ttf | ofl/zcoolqingkehuangyou/ZCOOLQingKeHuangYou-Regular.ttf | zcoolqingkehuangyou-OFL.txt |
| MaShanZheng.ttf | ofl/mashanzheng/MaShanZheng-Regular.ttf | mashanzheng-OFL.txt |
| LongCang.ttf | ofl/longcang/LongCang-Regular.ttf | longcang-OFL.txt |

Noto Sans SC 提供 100–900 可变字重，其余字体为常规字重，粗体和斜体由浏览器合成。各字体字符覆盖不同，未收录字符由系统字体补齐。工程保存字体名称，字体由应用统一提供，不重复打包进 .tomori。
