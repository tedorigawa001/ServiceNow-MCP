# AP03：C05のoptions受付とC07の第3引数を対にした互換判断

Version: release-ap03-c05-c07-compatibility-decision-draft-0.4 / Date: 2026-11-19。
Status: **C05-B＋C07-Bを採用。今回の承認は入力の受付方針に限る。** 比較・採用記録の基準HEADは`2837181`。[AP02／03設計](BEST_PRACTICE_RELEASE_AP02_AP03_REMOVAL_COMPATIBILITY_DESIGN.md)、[入口7件の引渡し](BEST_PRACTICE_RELEASE_AP02_AP03_AP05_ENTRY_DECISION_HANDOFF.md)、[C07比較](BEST_PRACTICE_RELEASE_AP03_C07_SOURCE_CONSTRUCTOR_ARGUMENT_DESIGN.md)に基づく。通常経路未切替、正式発行口／C実行入口／body起動閉鎖、全体受付無効、Unknown・調査保留、元期限と既定並列度を維持する。今回の変更はMDのみ。実装・発行／claim消費・旧試験変更／再実行・build／pack・実接続・実通信・設定変更・公開・コミット・Pushは行わない。

## 1 現行の静的境界

[prepareNewReviewComposition](../src/servicenow/bounded-read.ts)ではoptions省略／明示undefinedは既定の空object、null／関数など非objectは拒否。外側optionsは`Object.getOwnPropertyDescriptors(options)`でown descriptorを取り、許可keyはsignal／limits／synthetic_io。非列挙own keyも対象で、symbol・未知key・own accessorは拒否する。optionsの独自prototypeを読まず、そこから継承するfieldはdescriptor一覧に採らない。たとえば継承synthetic_ioだけでは旧fake分岐に入らず、継承signal／limitsだけならその値は利用されない。これらは通常の組込みprototypeを前提とした静的読取りで、全variantの実測ではない。

外側optionsに対するProxyの事前拒否はないため、descriptor取得中に`ownKeys`／`getOwnPropertyDescriptor` trapが呼ばれ得る。trapの例外は外側catchへ至り、BoundedReadErrorなら保持、その他ならinternal_review_errorへ写像される。own accessorを値として呼ばないこととProxy trapを呼ばないことは同じでない。snapshot／oauthに使う同ファイルの`pinDataObject`はProxyと独自prototypeを別途拒否するが、その制約を既存optionsへそのまま移すと互換差になる。[旧試験](../tests/review/private-composition.test.ts)には通常同期summary、許可signal／低減limits、own accessor等の拒否がある。proxy snapshotやclass snapshotの拒否は外側optionsの保証に数えない。

## 2 C05の比較

3案とも、AP02／03で旧lane撤去が承認された後の候補。own synthetic_ioは値がundefined／nullでも未知keyとして拒否し、旧fakeを呼ばない。比較表の「受理」は**外側options形状を通過**する意味で、後続のsignal／limits・snapshot・target検査や取消の結果を成功に固定しない。

| 入力（他は正常） | A：現行descriptor境界を維持 | B：先にProxy拒否、own-only維持（採用） | C：先にProxy拒否、さらにplain/null prototype限定 |
|---|---|---|---|
| 省略／明示undefined、通常objectまたはnull prototypeの許可own data | 受理 | 受理 | 受理 |
| 非Proxy・独自prototype、許可own dataあり | 受理 | 受理。own valueのみ使用 | 拒否。prototype制約追加による互換差 |
| 非Proxy・継承synthetic_io／signal／limitsのみ（getterを含む） | 継承値を読まない | 継承値を読まない。候補でown由来だけを明示 | 独自prototypeなら拒否 |
| 非Proxy・own synthetic_io（例：非列挙、値undefined、accessor） | 拒否 | 拒否 | 拒否 |
| 非Proxy・own禁止key／symbol／signal・limits accessor | 拒否 | 拒否 | 拒否 |
| Proxy（透過、trap付き、revoked） | 一律拒否ではない。反射時にtrapまたは例外があり得る | descriptor／prototype取得前に固定拒否 | 同左。brand確認よりprototype照合を先にしない |

Aは入力形状の互換を最も残すが、旧laneを消してもtrap非実行を保証できない。Cは入力を狭い形状へ統一できるが、非Proxyのclass instance、独自prototype、別realmのplain objectなどまで制限する候補になり得る。この追加制約は今回の撤去に必須ではない。**Bを採用**する。非Proxy optionsの既存のown-only利用を残し、Proxyだけを対応外とする。継承synthetic_ioは**無視**し、検出のためにprototype chainを探索しない。任意のobjectをplainと認定する案でもない。

## 3 C07との組合せと同期拒否

| 判断単位 | 採用仕様または別審査の候補 | 意図的な互換差・維持事項 |
|---|---|---|
| C05：prepareの任意のoptions | **案B**。既存の`node:util`の`types.isProxy`に相当する非介在の判定を、descriptor／prototype反射前に使う。options自身のown dataでsignal／limitsのみ受付。既定値は固定、取り込んだdescriptorだけから読む | 外側Proxyは今まで通過できたものも同期invalid_input。非Proxyの独自prototypeは許容し、継承値は採用しない。結果を取り出す内部recordもownだけとし、継承slotを参照しない |
| C07：sourceの廃止予定creation | **比較書の案B**。宣言は2引数、JSは2引数と「第3に明示undefinedを1個」のみ通常相当。第3が他の値、または4個以上は同期invalid_input。引数の中身を読まない | null／false／0／空文字を省略扱いしない。旧creation内のkeyがundefinedでも拒否。内部通常呼出しは2引数へそろえ、共有の`#openComposition`の初期結合・固定closeを残す。0／1引数一般の扱いは本判断の対象外 |
| C02〜04との接点：廃止するown synthetic_io | own `synthetic_io` は値・列挙性を問わず受け付けない。単独拒否は同期 `invalid_input` | 旧の正常prepared Promise・後段のPromise拒否を返さない。受付拒否をsignal値／snapshot／target／policy／生成の検査より優先する案は、複合不正の優先順として別審査。旧の先行エラーとの差や呼出し側の観測はC02〜04／06で個別承認する |

組合せの理由は、**撤去対象に値を渡して権限やcallbackを採用させず、通常の呼出し形状は必要以上に壊さない**こと。C05の明示undefinedはoptionsの既定値、C07の明示undefinedは廃止引数のJS互換措置で、互いの型や受付を広げない。C05のProxy拒否は最上位optionsに限定し、ネストしたsignal／limitsやsnapshotの専用guardを削除・変更しない。C07の拒否はconstructor bodyでの入力処理を制限するもので、引数式の評価・class field初期化・割当て0は約束しない。

## 4 承認前に揃える受入条件

| ID | 将来の対照（未実施） | 審査・停止条件 |
|---|---|---|
| AP03-V01 | 省略／明示undefined、独自／null prototype、継承getter、許可ownと継承の同名共存を個別に確認。継承getter呼出し0、own signalと低減limitsは従来どおり。通常の同期summary・初期binding・C/G/P=0・予約返却・固定close | prototypeだけで許可値を供給できたと扱わない。通常signal／limits・Permit・fetch・省略時summaryの変更があれば停止 |
| AP03-V02 | 外側Proxyの透過／throwing trap／revoked、own accessor・symbol・非列挙synthetic_ioを独立に対照。同期code、getter／trap 0、snapshot／inputの候補観測・policy・時計・生成／予約／dispatchの未到達を分ける | 旧のtrap例外や後段理由を維持した扱いにしない。timer0／C=0だけを未到達の証拠にしない。副作用観測のため新friendは作らない |
| AP03-V03 | C07-V1〜4を参照し、直接new／転送、2引数／明示undefined／他の第3／4個以上、同sessionの診断・会計と後続利用に差がないことを確認。出力JSの拒否順と型を分ける | ACK-34のcreation内keyを第3値の対照にしない。既存sourceとsessionの結合・停止責務を切るならAP02へ戻す |
| AP03-V04 | own synthetic_ioの正常旧transcript、不正値、複合不正を用いて旧同期throw／Promise／候補同期throwを別記。通常importと型・JSの差、影響を受ける外部利用・非提供告知を審査する | C02〜04／06の未確認・外部利用実態Unknownを互換性確認済みにしない。旧試験と配布物の判断はAP05、結果差はAP04に渡す |

## 5 採用記録（2026-11-19）

ユーザーの指示「C05-B＋C07-Bでいきましょう」により、C05の非Proxy own-only／外側Proxyの反射前拒否と、C07の通常2引数／JS明示undefinedの第3引数だけを許容する入力仕様を採用した。単独の拒否は同期 `BoundedReadError`（`code=invalid_input`）。第3の値がそれ以外、または4個以上なら拒否する。内部の通常呼出しの2引数化と既存の同期summary・同owner結合維持は将来の実施条件で、実施済みではない。

この指示はD04のC05／C07だけに適用する。C02〜04の旧Promiseから同期throwへの互換差・複合不正時の優先順、C06の型／import面、外部利用の実態はD04採用時点では別審査だった。AP03全体の承認、AP02の撤去・実装、AP05の旧試験処遇・配布物検査、AP01／04の保証差、AP06の公開は未承認。候補patch・実行結果は未記入のまま。

[C02〜04／06の採用記録 draft-0.2](BEST_PRACTICE_RELEASE_AP03_C02_C04_C06_COMPATIBILITY_REVIEW.md)に、後続のユーザー承認による案P（外側受付優先の同期拒否）とC06の型・import方針を記録した。D04の採用内容は変えず、具体的な撤去対象・実装・外部利用実態は別審査。
