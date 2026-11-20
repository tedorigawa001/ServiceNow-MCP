# AP03：synthetic_io廃止時の例外順と型・import面の互換審査

Version: release-ap03-c02-c04-c06-compatibility-review-draft-0.2 / Date: 2026-11-19。
Status: **C02〜04は外側受付優先の案Pを採用。C06は専用の型・import変更の方針を採用。撤去対象の確定・実装は未承認。** 静的照合の基準HEADは`2837181`。[AP02／03親設計](BEST_PRACTICE_RELEASE_AP02_AP03_REMOVAL_COMPATIBILITY_DESIGN.md)のD03とC06を扱う。[C05-B／C07-Bの採用](BEST_PRACTICE_RELEASE_AP03_C05_C07_COMPATIBILITY_DECISION_DESIGN.md)は入力方針に限り維持。通常経路未切替、正式発行口／C実行入口／body起動閉鎖、全体受付無効、Unknown・調査保留、元期限・既定並列度を維持する。MDのみ。実装・撤去・発行／claim消費・旧試験変更／再実行・build／pack・実接続・実通信・設定変更・公開・コミット・Pushは行わない。

## 1 現行で同期throwとPromiseを分ける点

[prepareNewReviewComposition](../src/servicenow/bounded-read.ts)はasync methodではない。外側のoptions descriptor／signal形状→snapshot／oauthのpin→target等の入力検査→own synthetic_ioのtranscript pin／bytes copy→session constructorの順で、この区間の失敗は同期throw。旧fake pinに成功してもconstructorの失敗が先ならPromiseは返らない。constructorが返って旧fake分岐へ進んだときだけPromiseを返し、`prepared_only` 又は後段の拒否になる。省略時は同期`ConstructorSummary`で、初期結合と固定closeを経る。

| 入口または観測 | 現行の静的境界・元試験 | 採用方針での差（未実装） |
|---|---|---|
| options省略／明示undefined／許可own dataのみ | 旧fakeを開始しない。通常は同期summary。既abortでcancelled、低減limit不正でinvalid_inputの旧対照がある | 同じ同期返却／元の失敗順と理由。関数をasync化しない。C05の外側Proxy拒否は別の採用済み差 |
| ownの正しいtranscriptを付け、先行検査・construct成功 | [ACK正対照](../tests/review/private-composition-ack.test.ts)は後段のprepared、bytes計上、closeを検査する。後段の取消・上限・release判断はPromise側の別結果 | 受付で同期invalid_input。旧preparedも旧後段のPromise拒否も返さない。Dのunknown／withheldや成功値を代送しない |
| ownで値undefined／null／false／0／空文字／不正transcript | 値のtruthinessで分けずdescriptorがあればpin対象。そこに到達すれば同期invalid_input。先にsnapshot／target等で止まることもある | 値・列挙性・内部構造に関係なく、own keyの存在で同じ固定同期拒否。値の検査・bytes copyをしない |
| own getter／setter・未知own key・symbol | descriptorで同期invalid_input。getterを値として評価しない。外側Proxyは旧コードと採用済みC05で別境界 | 同じ拒否。descriptorを使う前にC05-Bで外側Proxyを止める。継承keyは探索・実行しない |
| 呼出し側が`call().catch(…)`／`await call()`を使用 | Promiseが返ったときだけチェーンのcatchがその拒否を扱う。try内のawait式は同期throwもPromise拒否も捕捉し得る | 廃止入力は式の呼出しでthrowするため、戻り値に付けるcatchには届かない。try／awaitで捕捉できても返却契約の変更は残る |

## 2 複合不正の優先順：外側受付を先にする案Pを採用

比較案Pは「C05-Bの形状検査と同じ段で禁止own keyを固定拒否」。比較案Qは「旧の先行signal／snapshot／target検査を行ってから禁止keyを拒否」。Qでも旧constructorのclock／policy provider／admission、旧fake copyや後段Promiseを実行しない限り、全旧理由を再現できない。**Pを採用**する。廃止入力の拒否を先に確定でき、snapshot／targetの検査や生成に入らない。Qで旧優先順を保つために、廃止入力で旧provider・生成・I/Oを呼ぶことは候補にしない。

| 複合条件 | 現行で先に観測し得る位置・結果 | Pでの優先と、検証で分ける事実 |
|---|---|---|
| own synthetic_io＋不正signal形状／不正snapshot／不正target | 旧fake pinより前の該当箇所で同期invalid_input。同じcodeでも検査位置が違う | 外側受付で同期invalid_input。signal検査／snapshot pin／target parseそれぞれの未到達を観測し、code一致だけで同等としない |
| valid旧transcript＋既abortの正規signal | 入口のsignal brand検査はabortedを理由に拒否しない。ほかの先行検査が通ればconstructor末尾で停止を書き、後段のfake実行が返すPromiseはcode=cancelledで拒否され得る | 外側受付の同期invalid_input。signal listener／controller／timerを作らず、元signalを変更しない。正常optionsの既abort対照は元のcancelledを維持 |
| valid旧transcript＋throwするpolicy provider／上限不正／既占有principal | fake pin後のconstructor側で、条件によりconfig_invalid／invalid_input／review_busy等の同期throw。複数故障が重なると全理由は返さない | いずれも禁止keyで同期invalid_input。provider・clock・新規admission／owner／予約・dispatch未到達と、先行session状態不変を別確認 |
| own synthetic_ioのaccessor＋別不正own key／symbol、または外側Proxy | 旧のdescriptor一覧を検査。非Proxyのown accessorは呼ばず、外側Proxyでは反射trapが動き得る | C05-Bで先に外側Proxyを拒否。非Proxyの禁止descriptorは同じ固定code、key順に特別な優先理由を公開しない。getterもtrapも0 |
| own synthetic_ioなし・継承synthetic_ioのみ＋別不正 | 継承は旧受付に使わない。own許可値等の既存検査に従う | C05-Bで継承値を読まず、通常側の既存順序・理由へ進む。継承された禁止名の存在を自動で不正扱いしない |

Pの「先」はmethod内の判定順であり、呼出し側の引数評価やmodule評価を止める意味ではない。受付は許可own data descriptorだけを取り込み、禁止keyがあれば値や入れ子を読まない。将来の合成試験では一次理由と未到達の独立観測を対にする。C=0／timer=0だけで未生成と結論せず、正常省略時には実際に初期結合・一時予約・固定closeを通ることを別の正対照で維持する。

## 3 C06：宣言、名前付きimport、モジュール自体の不在は別

[package設定](../package.json)は`main=dist/server.js`、ESM、`dist/`同梱規則と`!dist/review/abort-scope-evidence*`等の除外を持ち、現行設定に`exports`欄はない。[TS設定](../tsconfig.json)はJS／宣言／mapを出力し、[現行の梱包検査](../tests/review/package-canonical-budget.mjs)はfake I/OのJS／宣言／両mapを同梱期待としている。これは設定と試験本文の静的事実で、最新配布済みtarballの実物・外部利用者・公開APIとしての約束までは確認していない（Unknown）。

| 利用面 | 現行を読む根拠 | 採用方針と将来の確認 |
|---|---|---|
| TSのcomposition呼出し | bounded-readにsynthetic overload・PreparedSummaryの型依存と通常overloadがある | 通常の同期overloadだけ維持。synthetic overload・専用の宣言依存を除く。新鮮なobject literalと変数経由の構造的型付けを別検査し、全ての余剰keyを型エラーにできるとは主張しない。JSの固定拒否が別途必要 |
| TSの旧専用型・source第3引数 | fake moduleのCompositionFakeIO、sourceのCompositionSourceConstruction、sessionのprobe型などが専用境界にある | AP02で共有／専用を確定後、専用型と残存参照を宣言から除く。C07-Bの宣言は2引数、明示undefinedのJS許容は型の第3引数復活に使わない |
| 残るbounded-readモジュールの旧名前付きimport | takeStatusAcceptanceProbe／takeNativeStatusCompositionProbe／claimPrivateCompositionSourceの値exportがある | AP02で当該名・登録／取得本体が消える候補。モジュールが正常に解決できても、旧名の静的named importはlink時失敗。旧take二度目の同期codeとは非同等 |
| 同モジュールのnamespace／動的import | moduleがロードでき、旧名をpropertyとして取得できる | moduleの通常ロード成功と旧own property不在を対で確認。動的import後の旧名の取得はundefinedになり得るが、import Promise自体の拒否とは区別。互換shimは作らない |
| 廃止専用moduleへのdeep import | 構成上、一部のfake moduleは同梱期待、wrapperは除外対象。repoのdistと利用者の配布物を混同しない | AP02で専用moduleまで除外すると決めたものは解決失敗に変わる。残るmoduleの旧名不在・通常rootのロード成功と分ける。既存package全体にexports制約を追加する案は本審査の対象外 |

## 4 採用範囲と今後の確認

1. **D03の採用範囲：** Pの早期同期拒否、複合条件の固定code、旧後段Promiseを返さない互換差を単位にする。候補では通常の同期summary／固定closeと、正規signal／低減limitsの元理由を正対照にする。
2. **C06の採用範囲：** 専用overload・専用型の撤去、新旧のnamed／namespace／module解決の違いを告知対象にする。具体的な削除名とモジュールはAP02の到達辺・通常owner維持と結ぶ。外部利用実態が未確認のまま互換性確認済みとはしない。AP06の版・公開承認へ繰り上げない。
3. **AP05の受入：** 同revisionの空build／隔離配布物で、正常import・通常実class結合・禁止API不在・型出力・seeded残留検出を独立に照合する。旧試験の継続・移行・不在確認は別記し、単なる起動失敗／依存欠落を成功にしない。今回は未実施。

## 5 採用記録（2026-11-19）

ユーザーの指示「推奨案を承認します」により、C02〜04は案Pを採用する。C05-Bの外側Proxy確認を前提に、禁止own `synthetic_io` は値・列挙性に関係なく、signal値／snapshot／targetの検査・provider呼出し・session生成に先立ち、同期の `BoundedReadError`（`code=invalid_input`）で拒否する。他の不正と重なっても外側受付を優先し、旧preparedの成功Promise・後段のPromise拒否は返さない。禁止own keyがない通常経路は、既承認C05-B／C07-Bと元の同期summary・エラー順・通常結合を維持する。

C06は、通常の型・importを残し、専用overload／宣言依存と旧入口の変更を告知対象にする方針を採用する。残るモジュールの旧named export不在、namespace上の旧名不在、廃止モジュール自体の解決失敗を別の互換差として扱う。この承認はAP02で除去する名前・モジュール・到達辺の確定、package全体のexports制約、互換shimの導入を承認しない。外部利用の実態はUnknownのまま。

AP03全体の承認、AP02の撤去・実装、AP05の旧試験処遇・配布検証、AP01／04の保証差とAP06の版・公開は別審査。候補patch・実行結果は未記入。正式発行口等の閉鎖条件は維持する。
