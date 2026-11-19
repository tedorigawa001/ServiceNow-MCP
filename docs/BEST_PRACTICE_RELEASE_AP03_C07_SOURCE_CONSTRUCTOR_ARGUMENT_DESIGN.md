# AP03 C07：source constructorの第3引数・互換差と拒否境界

Version: release-ap03-c07-source-constructor-argument-draft-0.1 / Date: 2026-11-19。
Status: **比較案。仕様選択・互換変更・撤去は未承認。** 基準HEADは`16271eb`。[AP02／03設計](BEST_PRACTICE_RELEASE_AP02_AP03_REMOVAL_COMPATIBILITY_DESIGN.md)のC07／D04と[入口7件の引渡し](BEST_PRACTICE_RELEASE_AP02_AP03_AP05_ENTRY_DECISION_HANDOFF.md)のED01／04／05／07を具体化する。C05のoptions継承／Proxy、C02〜04のsynthetic入力、C06のimport面、AP05の旧試験処遇は別判断。AP01〜06は未承認のまま。

通常経路未切替・正式発行口／C実行入口／body起動閉鎖・全体受付無効・Unknown・調査保留と、既存期限・既定並列度を維持する。今回の変更はMDのみ。実装・発行／claim消費・旧試験変更／再実行・build／pack・実接続・実通信・実機操作・設定変更・公開・コミット・Pushは行わない。

## 1 現行の扱いと共有呼出し

[現source](../src/review/bounded-source.ts)は第3引数`creation`をtruthyの場合だけ読む。通常2引数と明示`undefined`／`null`／`false`はこの分岐を通らない。truthyな場合は`#session`代入後に`creation.key`を評価して[session側claim](../src/servicenow/bounded-read.ts)を呼ぶ。通常生成済みsessionに推測keyならclaimがfalseで、`BoundedReadError('invalid_input')`を同期throwし、capture等へ進まない。旧経路の`creation.key`の読取り自体はgetter／Proxy trapを非実行にする入口ではない。以下はコード上の分岐であり、全variantの実行結果・外部利用実態は未確認。

通常の[adapter](../src/review/update-set-adapter.ts)と`withBoundedUpdateSetSource`は2引数。一方、**syntheticを省略しても共有の`#openComposition`は現状 `new BoundedUpdateSetSource(this,input,creation)` と呼ぶ**。省略時の`creation`は`undefined`だが、sourceに届く実引数は3つ。個数だけを厳格化すると、この共有点で省略時の同期summaryが失敗する。両案で、維持する内部通常呼出しは2引数へ正規化する候補とする。旧private callbackが実際に渡る枝はAP02で分離・撤去対象を確定し、機械的に引数だけ落として成功扱いにしない。通常の同session／snapshot／core／lease／ownerへの初期source結合・失効／解放を残す。

## 2 同じ有効なsessionとinputでの案比較

案Aは**第3引数の存在を拒否**。案Bは**明示`undefined` 1個だけを省略相当として許容**。比較案ではどちらも4個以上の実引数を拒否する（Bで第3値だけ見て第4以降を黙認する案とは別）。この追加引数規則も承認対象。0／1引数や必須field一般の検査はC07で変更しない。両案とも宣言上は2引数に絞る候補で、実行時の受入は別の観測。拒否はすべて同期の固定`BoundedReadError`、`code=invalid_input`、source返却なしとする候補。

| 入力（第1／2引数は同じ有効値） | 現行の静的分岐 | 案A：実引数3個以上拒否 | 案B：第3がundefinedの3個だけ許容 |
|---|---|---|---|
| 2引数のみ | 通常生成 | 維持 | 維持 |
| 第3 = `undefined` | 分岐なし | 拒否。明示undefinedを渡すJS呼出しに互換差 | 通常相当。値を保持・転送しない。TS宣言上は許可しない |
| 第3 = `null`／`false`／`0`／空文字 | falsyで分岐なし | 全て拒否 | 全て拒否。truthiness判定は使わない |
| 第3 = 旧creation object（keyがobject／undefined／nullを別々に） | 通常生成済みsessionではclaimがfalse、同期invalid_input | 中身のkeyを読まず受付で拒否 | 同左。creation内のundefinedは受入条件にならない |
| 第3 = key getter付きobject／Proxy／関数 | truthyで`key`評価あり。getter／trapの例外は固定codeとは限らない | getter／trapに触れず拒否 | 同左。undefinedとの厳密比較のみで値を調べない |
| 第3 = `undefined`、第4あり（第4が`undefined`でも） | 第4以降は未参照 | 拒否 | 拒否。第4の値を読まない |

判断軸は「明示undefinedを渡す既存JSの互換性を残す価値」と「3引数以上を一律に閉じる契約の単純さ」。リポジトリ内の既知呼出し点だけでは外部ラッパー／直接import利用の有無は分からない。出力宣言の引数数、JS実行時の受付、constructorの反射的な`length`の観測は別に記録する。候補を選択する前に余剰引数の範囲と非提供告知を提示し、採用案・承認者・日付は未記入とする。

## 3 拒否点と非介在の上界

拒否判定の入力はconstructorに到着した個数と、Bで3個の場合の第3値と`undefined`の厳密比較だけ。第3引数のfield、prototype、descriptor、列挙、coercion、callbackは使わず、session／inputの参照先にも触れない。source固有のbinding、claim／capture、時刻／会計、予約、dispatch、旧callbackの保持／起動より前に判定する。複合不正でも「余剰引数が拒否対象なら、その呼出しで後段の独自処理へ入らず固定code」が候補。通常2引数で起きる元の失敗順序は変更しない。

判定を「constructor本体の最初の処理」と設計しても、呼出し側の引数式／spread・object確保・クラスfield初期化に先行するとは主張しない。現sourceには`new Set()`等のfield初期化とinputのparameter propertyがある。[TS設定](../tsconfig.json)はES2022／宣言・map出力で、将来の候補では副作用を持つ初期化／引数束縛や`#session`代入を含む**emit後の順序**を確認する。sourceの先頭に検査を置いただけでは通過条件を満たさない。拒否時に実sessionの状態を変えないことと、メモリ割当て0は別。後者は候補要件にしない。呼出し側が先に作った元sessionのcleanup権限を拒否処理に移さず、勝手にclose／取消しない。内部の先行生成・失敗rollbackは既存ownerの責務を維持する。

## 4 将来の受入条件と個別判断

| ID | 受入条件（未実施） | 停止条件／引渡し |
|---|---|---|
| C07-V1 | 承認案の全セルをJSの直接newと引数転送を代表する`Reflect.construct`で確認。2引数の同期生成、明示undefined相当、4個以上、固定同期codeを分離する。型エラーは別の対照 | JSの拒否をTSの引数エラーで置き換えない。通常2引数の退行、第3／第4の仕様未選択なら停止 |
| C07-V2 | getter／Proxy／旧callbackの個別カウンタ0、既存sessionの診断・requests／payload等の前後不変、同sessionの後続正常利用を独立に検査。通常2引数または許容undefinedを比較対象にする | 資源未生成をrequests=0だけから推定しない。新friend／公開inspect口で試験しない。元試験の直接assertに観測を遡及加算しない |
| C07-V3 | 共有呼出しの省略時同期summaryと通常source／Permit・fetch・停止／closeを正対照にする。省略時の初期source binding、transport claim、C/G/P=0、予約返却・固定close・dispatch unavailableを維持 | 旧[省略時テスト](../tests/review/private-composition.test.ts)を期待値変更で通さない。旧callbackを消す過程で共有結合を失うならAP02へ戻す |
| C07-V4 | 候補の同revisionでJS／宣言／mapと隔離配布物を検査し、外部claim・callbackの不在と通常import成功を対にする。旧SA-25／ACK-34・35／CR04は元実classの対照として保持 | 入口不在は旧guardの実行同等性ではない。単なる依存欠落は不在成功にしない。切替・旧試験処遇・配布物検証はAP02／05の別承認 |

AP03で先に決めるのは、明示undefinedの互換幅と4個以上の扱い、同期codeと非介在の境界。次にAP02で共有呼出しの2引数化と結合維持、AP05で元assertionと候補artifactの試験境界を対にする。AP03の選択だけで実装・撤去・公開へ進まない。
