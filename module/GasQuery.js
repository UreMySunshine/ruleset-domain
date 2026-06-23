/**
 * 实时油价查询脚本 - 优化版（含0号柴油 + 地区信息 + Emoji美化）
 * 兼容 Surge、Loon
 * 原作者：@RS0485，修改：@keywos
 */

class GasPriceQuery {
    constructor() {
        this.defaultRegion = 'shanxi-3/xian';
        this.baseUrl = 'http://m.qiyoujiage.com';
        this.storageKey = 'yj';
        this.headers = {
            'referer': 'http://m.qiyoujiage.com/',
            'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
        };
    }

    /**
     * 获取地区配置
     */
    getRegion() {
        if (typeof $argument !== 'undefined' && $argument.trim()) {
            return $argument.trim();
        }
        try {
            const storedRegion = $persistentStore?.read(this.storageKey);
            if (storedRegion && storedRegion.trim()) {
                console.log('使用存储的地区配置:', storedRegion);
                return storedRegion.trim();
            }
        } catch (error) {
            console.log('读取存储配置失败:', error.message);
        }
        return this.defaultRegion;
    }

    /**
     * 解析油价数据
     */
    parsePrices(htmlData) {
        const priceRegex = /<dl>[\s\S]*?<dt>(.*?油)</dt>[\s\S]*?<dd>(.*?)\(元\)<\/dd>/g;
        const prices = [];
        let match;
        while ((match = priceRegex.exec(htmlData)) !== null) {
            if (match[1] && match[2]) {
                prices.push({
                    name: match[1].trim(),
                    value: `${match[2].trim()} 元/升`
                });
            }
        }
        return prices;
    }

    /**
     * 解析地区名称
     */
    parseRegionNameFromHtml(htmlData) {
        try {
            const titleMatch = htmlData.match(/<title>([\s\S]*?)<\/title>/i);
            if (titleMatch && titleMatch[1]) {
                return titleMatch[1]
                    .replace(/[\r\n]/g, '')
                    .replace(/(汽油|柴油|油价|查询|最新|今日|价格|信息|\d{4}年?\d*月?\d*日?|_\s*油价查询网?)[\s\S]*$/i, '')
                    .trim();
            }
        } catch (_) {}
        return '';
    }

    /**
     * 解析价格调整信息（带Emoji）
     */
    parseAdjustmentInfo(htmlData) {
        const adjustRegex = /<div class="tishi">\s*<span>(.*?)<\/span><br\/>([\s\S]*?)<br\//;
        const match = htmlData.match(adjustRegex);
        if (!match || match.length < 3) return '暂无调价信息 🤷‍♂️';

        try {
            const fullText = `${match[1].trim()} ${match[2].trim()}`;
            
            // 日期
            let adjustDate = '';
            let dateMatch = 
                fullText.match(/(\d{1,2}月\d{1,2}日)(?:\d{1,2}时)?调整/) ||
                fullText.match(/(\d{4}年\d{1,2}月\d{1,2}日(?:\d{1,2}时)?)/) ||
                fullText.match(/(\d{1,2}月\d{1,2}日)/);
            
            if (dateMatch) {
                adjustDate = dateMatch[1] + (dateMatch[1].includes('时') ? '' : '24时');
            }

            // 趋势 Emoji
            let trendEmoji = '';
            let trendText = '';
            if (/下降|下调|下跌|降低|降价/.test(fullText)) {
                trendEmoji = '📉';
                trendText = '下调';
            } else if (/上升|上调|上涨|升高|涨价/.test(fullText)) {
                trendEmoji = '📈';
                trendText = '上调';
            }

            // 幅度
            let adjustValue = '';
            const rangeMatch = fullText.match(/([\d.]+)元\/升\s*[-至到]\s*([\d.]+)元\/升/);
            if (rangeMatch) {
                adjustValue = `${rangeMatch[1]}–${rangeMatch[2]}元/升`;
            } else {
                const literMatch = fullText.match(/([\d.]+)元\/升/);
                if (literMatch) {
                    adjustValue = literMatch[0];
                } else {
                    const tonMatch = fullText.match(/([\d.]+)元\/吨/);
                    if (tonMatch) {
                        adjustValue = tonMatch[0];
                    }
                }
            }

            // 搁浅状态
            const isHold = /搁浅/.test(fullText);
            const holdEmoji = isHold ? '⏸️' : '';

            const parts = [];
            if (adjustDate) parts.push(adjustDate);
            if (trendEmoji && trendText && adjustValue) {
                parts.push(`${trendEmoji} ${trendText} ${adjustValue}${holdEmoji ? ' ' + holdEmoji : ''}`);
            } else if (adjustValue) {
                parts.push(`${adjustValue}${holdEmoji}`);
            }

            return parts.join(' ') || '调价信息待更新 🤔';
        } catch (error) {
            console.log('解析调价信息失败:', error.message);
            return '调价信息解析失败 😵';
        }
    }

    /**
     * 格式化输出内容（带Emoji）
     */
    formatContent(prices, adjustmentInfo, regionName) {
        const displayOrder = [
            { key: '92号汽油', emoji: '🟢' },
            { key: '95号汽油', emoji: '🔵' },
            { key: '98号汽油', emoji: '🟣' },
            { key: '0号柴油', emoji: '🟡' }
        ];

        const priceMap = {};
        prices.forEach(price => {
            let key = price.name;
            if (/92/.test(price.name)) key = '92号汽油';
            else if (/95/.test(price.name)) key = '95号汽油';
            else if (/98/.test(price.name)) key = '98号汽油';
            else if (/0号|0#/.test(price.name)) key = '0号柴油';
            priceMap[key] = price.value;
        });

        const lines = [];

        // 地区
        if (regionName) {
            lines.push(`📍 ${regionName}`);
            lines.push('');
        }

        // 油品价格
        displayOrder.forEach(item => {
            if (priceMap[item.key]) {
                const label = item.key
                    .replace('号汽油', '')
                    .replace('号柴油', '#柴油');
                lines.push(`${item.emoji} ${label}  ${priceMap[item.key]}`);
            }
        });

        lines.push('');
        lines.push(adjustmentInfo);

        return lines.join('\n');
    }

    /**
     * 执行查询
     */
    async query() {
        const region = this.getRegion();
        const queryUrl = `${this.baseUrl}/${region}.shtml`;
        console.log('查询URL:', queryUrl);

        $httpClient.get({
            url: queryUrl,
            headers: this.headers,
            timeout: 10000
        }, (error, response, data) => {
            this.handleResponse(error, response, data, queryUrl);
        });
    }

    /**
     * 处理响应
     */
    handleResponse(error, response, data, queryUrl) {
        if (error) {
            this.sendError('网络请求失败，请检查网络连接 📡');
            return;
        }
        if (!response || response.status !== 200) {
            this.sendError('服务器响应异常 🚨');
            return;
        }
        if (!data || data.trim() === '') {
            this.sendError('获取数据失败 💔');
            return;
        }

        try {
            const prices = this.parsePrices(data);
            if (prices.length === 0) {
                this.sendError('数据解析失败，可能网站结构已变更 🏗️');
                return;
            }

            const regionName = this.parseRegionNameFromHtml(data);
            const adjustmentInfo = this.parseAdjustmentInfo(data);
            const content = this.formatContent(prices, adjustmentInfo, regionName);

            $done({
                title: regionName ? `今日油价 · ${regionName}` : '今日油价 ⛽️',
                content: content,
                icon: 'fuelpump.fill',
                'icon-color': '#CA3A05'
            });

        } catch (parseError) {
            console.log('数据处理失败:', parseError.message);
            this.sendError('数据处理失败 💻');
        }
    }

    /**
     * 发送错误信息
     */
    sendError(message) {
        $done({
            title: '油价查询失败 😢',
            content: message,
            icon: 'exclamationmark.triangle.fill',
            'icon-color': '#FF3B30'
        });
    }
}

// 执行查询
try {
    new GasPriceQuery().query();
} catch (error) {
    console.log('脚本执行失败:', error.message);
    $done({
        title: '油价查询失败 😵',
        content: '脚本执行异常',
        icon: 'exclamationmark.triangle.fill',
        'icon-color': '#FF3B30'
    });
}
