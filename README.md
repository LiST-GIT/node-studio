
## 异步流控制

### 开始的唠叨

```
小代码本来没想上传，夜里看博客，写的关于js流控制，感觉思想比较传统。
我个人不太喜欢用Promise（可能是我英文不好，这个词我总记不住），所以在自己开发项目的时候写的这么一套流程控制。
我也没有博客，就放在这里随便唠叨一下。

附带支持有局限的热更新
```

### 安装

```
npm install node-studio
```

### 设计思想

```
就比如有一个14岁的小明，他在边吃草莓冰淇淋，边走路，那么他的结构是:
class 人
    - instance 人
        - prop 姓名: 小明
        - prop 年龄: 14
        - procedure 吃冰淇淋
            - prop 冰淇淋.口味: 草莓
            - prop 冰淇淋.剩余: 1

            - step1 []                        把冰淇淋到嘴边
            - step2 [把冰淇淋到嘴边完成]        吃一口 && 冰淇淋.剩余 -= 0.3
            - step3 [吃一口完成]                把手拿走 && 慢慢吃
            - step4 [慢慢吃完成]                还有冰淇淋么 ? 回到step1 : 退出流程

            - 退出的时候记得把东西扔进垃圾箱
        - procedure 走路
            - step1 []                        左脚运动
            - step2 [左脚运动完成]            右脚运动
            - step3 [右脚运动完成]            回到step1
用代码来表示:
{
    owner: {
        姓名: '小明',
        年龄: 14,
    },
    procedures: {
        吃冰淇淋: [
            function() {
                console.log( '我叫' + this.owner.姓名 + '，今年' + this.owner.年龄 + '岁。' );
                console.log( '我在吃一个' + this.冰淇淋.口味 + '味的冰淇淋' );
            },
'start:',                        // 这就我的最爱，幸福的goto label
            function() {
                console.log( '把冰淇淋到嘴边' );
                setTimeout( () => this.inform( '手', '把冰淇淋到嘴边完成' ), 100 );
            },
            {
                把冰淇淋到嘴边完成: function() {
                    console.log( '吃一口' );
                    setTimeout( () => this.inform( '嘴', '吃一口完成', Date.now() ), 100 );
                },
            },
            {
                吃一口完成: function( sender, time ) {
                    if ( sender === '嘴' ) {
                        console.log( '吃的时间' + time );
                        console.log( '把手拿走' );
                        setTimeout( () => this.inform( '手', '把手拿走完成' ), 100 );
                        this.冰淇淋.剩余 -= 0.3;
                        console.log( '慢慢吃' );
                        setTimeout( () => this.inform( '嘴', '慢慢吃完成' ), 1000 );
                    }
                },
            },
            {
                慢慢吃完成: function() {
                    if ( this.冰淇淋.剩余 <= 0 ) {    // 别问我冰淇淋剩余为什么会是负的，可能吃到手指了吧
                        return '@exit';        // 退出过程
                    } else {
                        return '@start';    // 幸福的goto
                    }
                },
            },
'exit:',
            function() {
                console.log( '丢进垃圾箱' );
            },
        ],
        走路: [
'start:',
            '[左脚迈步]',    // 这里是说明
            function() {
                console.log( '左脚运动' );
                setTimeout( () => this.inform( '左脚', '左脚运动完成' ), 1000 );
            },
            {
                左脚运动完成: function() {
                    this.comment = '右脚迈步';        // 也可以这样设置说明
                    console.log( '右脚运动' );
                    setTimeout( () => this.inform( '右脚', '右脚运动完成' ), 1000 );
                },
            },
            '右脚运动完成',        // 这样也可以接收事件
            '@start',
        ],
    },
}
这就是我的设计思路。
这个时候问题来了，如果有人过来跟小明说话，应该怎么办？
中断，具体代码在示例中。
```

### 示例

```javascript

// person.js

const studio = require( 'node-studio' );

module.exports = {
    owner: {
        姓名: null,
        年龄: 0,
    },
    procedures: {
        有人搭讪: [
            function() {
                this.owner.inform( null, '搭讪' );  // 这个事件通知是全局事件通知
                console.log( '%% 有人搭讪了' );
            },
            2000,            // 聊了2秒的天
            function() {
                this.owner.inform( null, '搭讪完成' );
                console.log( '%% 拜拜~' );
                // 不用 return '@exit' 最后会退出
            },
        ],
        吃冰淇淋: [
            '.interrupts',
            {
                搭讪: '@被人搭讪了',            // 等于   搭讪: () => '@被人搭讪了'
            },

            function() {
                this.第几口 = 0;
                console.log( '我叫' + this.owner.姓名 + '，今年' + this.owner.年龄 + '岁。' );
                console.log( '我在吃一个' + this.冰淇淋.口味 + '味的冰淇淋' );
            },
'start:',                        // 这就我的最爱，幸福的goto label
            function() {
                console.log( '把冰淇淋到嘴边' );
                setTimeout( () => this.inform( '手', '把冰淇淋到嘴边完成' ), 100 );
            },
            {
                把冰淇淋到嘴边完成: function() {
                    console.log( '吃一口' );
                    setTimeout( () => this.inform( '嘴', '吃一口完成', ++this.第几口 ), 100 );
                },
            },
            {
                吃一口完成: function( sender, number ) {
                    if ( sender === '嘴' ) {
                        console.log( '把手拿走' );
                        setTimeout( () => this.inform( '手', '把手拿走完成' ), 100 );
                        this.冰淇淋.剩余 -= 0.3;
                        console.log( '慢慢吃，第' + number + '口' );    // 其实可以直接用 this.第几口 我只是想试一下传递参数
                        setTimeout( () => this.inform( '嘴', '慢慢吃完成' ), 1000 );
                    }
                },
            },
            {
                慢慢吃完成: function() {
                    if ( this.冰淇淋.剩余 <= 0 ) {    // 别问我冰淇淋剩余为什么会是负的，可能吃到手指了吧
                        return '@exit';        // 退出过程
                    } else {
                        console.log( '冰淇淋还有' + this.冰淇淋.剩余 );
                        return '@start';    // 幸福的goto
                    }
                },
            },
'被人搭讪了:',
            {
                搭讪完成: '@start',
            },
'exit:',
            function() {
                console.log( '丢进垃圾箱' );
            },
        ],
        走路: [
            '.interrupts',
            {
                搭讪: '@被人搭讪了',
            },

'start:',
            '[左脚迈步]',    // 这里是说明
            function() {
                console.log( '-- 左脚运动' );
                setTimeout( () => this.inform( '左脚', '左脚运动完成' ), 1000 );
            },
            {
                左脚运动完成: function() {
                    this.comment = '右脚迈步';        // 也可以这样设置说明
                    console.log( '-- 右脚运动' );
                    setTimeout( () => this.inform( '右脚', '右脚运动完成' ), 1000 );
                },
            },
            '右脚运动完成',        // 这样也可以接收事件
            '@start',

'被人搭讪了:',
            {
                搭讪完成: '@start',
            },
        ],
    },
};

```

```javascript

// index.js

const studio = require( 'node-studio' );

studio.require( 'person', __dirname + '/person.js' );
var xiaoming = studio.worker( 'person', '这个id随便', { 姓名: '小明', 年龄: 14 } );
xiaoming.procedure( null, '吃冰淇淋', { 冰淇淋: { 口味: '草莓', 剩余: 1 } } );
xiaoming.procedure( null, '走路', {} );

setTimeout( () => xiaoming.procedure( null, '有人搭讪', {} ), 1000 );
setTimeout( () => xiaoming.procedure(), 10000 );        // 终止全部

// 这里延时可以有局限的热更新
// setTimeout( () => studio.require( 'person', __dirname + '/person.js' ), 10000 );

```

### 写在最后

```
还有一些有趣的用法我就不写了，反正也没人用，我也就是自娱自乐，如果你有兴趣，可以加我qq，你猜我qq是多少？
```
