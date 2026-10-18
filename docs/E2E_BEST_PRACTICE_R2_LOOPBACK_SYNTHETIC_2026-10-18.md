# BP-5 R-2：固定ループバック待受・一度限りの開始ページの合成検証

Date: 2026-10-18 / Status: 内部PoCの合成検証。実PDI・実ブラウザー認可・実token発行は未実施。

## 1. 範囲

[接続設計draft-0.4 §12](BEST_PRACTICE_BP5_R2_PDI_ADAPTER_RUNNER_DESIGN.md#12-固定ループバック待受と開始ページ2026-10-18)の
`R2LoopbackListener`を`src/review/r2-loopback.ts`に実装した。
固定loopback上の実HTTP/TCPを使い、OAuthアダプター→R2ReviewSessionの実装をそのまま接続する。
外部PDI向けfetchだけを合成応答に置換し、インターネットへ認可/交換/本人確認要求を送っていない。

telemetry調査・maint担当者への依頼は保留。PDIのアカウント/ロール/ACL/OAuth登録/設定は変更していない。
実ブラウザーは開かず、テストはHTTPページを取得・解析するだけで認可リンクを辿らない。
公開MCP/CLI/server.ts・依存/配布設定・固定評価セット・G0の合成issuer制約は変更していない。

## 2. 固定待受とHTTP入力

- IPv4の127.0.0.1:18765だけにbind。port/hostの変更口、自動fallback、既存プロセスの停止なし。
  bind競合は固定callback_unavailable。bind前/途中の取消でも認可を始めず、待受と内部sessionを解放する。
- 開始は厳密な`GET /bp5/start`だけ。Hostはraw headerで1件かつ`127.0.0.1:18765`完全一致。
  method・path・Host・body/framingを先に検査し、bodyなしで要求のendを確認した後にだけリンクを表示する。
- Content-Lengthは未指定または文字列0、Transfer-Encodingは不可。開始URLのquery/fragment/絶対形式、
  別path/foreign Host/重複Hostを拒否。duplicate Content-Length等はNodeのHTTP parserでも拒否する。
- method拒否は405、Host/path/body不正は400。CONNECTは405、Upgradeは400、Expectは417。
  raw packet、request/response object、元例外をログ・ページ・完了通知へ含めない。
- 開始ページへのforeign Origin/cross-site要求は403、prefetch/prerenderは400。リンクを消費しない。
  callbackの正規cross-site navigationは許容し、代わりに固定Host/state/code/error/PKCEと本人確認を必須とする。
- header/target上限8KiB、同時接続16、1socket1request。無通信socketは2秒で切断し、
  Node headersTimeout/requestTimeoutも2秒に設定。無通信2秒はTCP全体の厳密な総期限の主張ではない。
  認可待ち全体は最大300秒、既存の交換10秒・本人確認10秒・レビュー60秒の上限を変更しない。

## 3. 一度限りのページ・callback

開始ページは認可URLをHTML属性として符号化した明示リンクのみ。自動redirect/submit、外部資源、
手動code入力、資格情報の自動入力、ブラウザー起動はない。
正常な再取得にはリンクを含めず409を返し、start_page_reusedで認可単位全体を停止する。
先読み等で消費された場合も再表示・再認可しない。

stateとchallengeを含む認可URLは**初回開始ページだけに意図して渡す**。
そのページ全体を秘密非露出の対象にするという意味ではない。JSON/inspect/ログ/失敗結果や、
2回目以降のページ、callback応答へは出さない。
同一端末の別プロセスが最初にページを取る可能性は残る。一度限り表示は本人性の証明ではない。

正規callbackの消費通知をadapter内へ追加し、connectionからHTTP層へ伝える。
同期fetch例外でも「受理済みcallback」と「不正callback」を取り違えない。
不正state/重複/未知query/code+errorは400、交換なしで正当なcallbackを引き続き待つ。
正規code/errorは1回だけ消費し、HTTP層へは汎用の処理済みページだけを返す。

全ページにno-store/referrer-policy:no-referrer/nosniffと、default-src/base-uri/form-action/frame-ancestors noneのCSP。
開始ページはscriptなし。callbackだけ固定hashのhistory.replaceStateを許可する。
元query、OAuth error description、本人確認の成否、token、本人IDをHTMLへ埋め込まない。
ブラウザー/OSの全履歴から消えたとは保証しない。

callback応答のfinish/close後にHTTP待受だけを閉じ、同じtokenで固定GET本人確認へ進む。
別アカウントcodeで交換できてもidentity_mismatchで停止し、レビュー取得はない。
発行済み/別アカウントtokenの可能性は既存のboolとして残し、自動失効・再認可はしない。

## 4. 終了と所有権

外部Abort・明示close・認可期限・ページ再取得では待受と内部connectionを両方停止する。
全socketを追跡し、HTTP/未完了/upgrade接続を破棄、server.closeを待ち、timerと外部Abort購読を解除する。
解放したportを別の新しいlistenerが使用しても、古い認可処理の中断でその新しいlistenerを閉じない。

`completion`は認可/本人確認の完了通知で、レビュー/runner全体の最終結果ではない。
成功後はHTTPだけが閉じ、内部に確認済みsessionが残る。呼出し元は成功/失敗を問わずfinallyでcloseする。
SDK/レビュー実行へ進めるrunnerは今回未実装。OS signal/385秒全体監督・終了票・実失効手順も後続工程。
JS/transport/OS上のコピーの完全消去や、ローカル終了によるサーバーtoken失効は保証しない。

## 5. 合成試験と結果

`tests/review/r2-loopback.test.ts`の新規46件で次を確認した。

| 観点 | 確認内容 |
|---|---|
| ページ | 固定URL/HTML属性符号化、CSP/キャッシュ/Referer制御、明示リンク、再取得409と停止、外部資源/CORS許可なし |
| HTTP入力 | foreign/曖昧/重複Host、method/path/body/TE、絶対URL、raw duplicate Content-Length、Expect/CONNECT/Upgradeを拒否 |
| ブラウザー属性 | foreign Origin/cross-site/prefetchの開始ページ拒否。正規callbackのcross-siteは受理 |
| callback | 不正state/重複/未知query/code+error/受信transport不正を交換前に拒否。正規callbackへ復帰可能 |
| 正常・拒否 | 実adapter/sessionで交換・固定GET本人確認。OAuth denial/別アカウント停止。browser応答は汎用ページのみ |
| 競合・中断 | ポート競合でfallbackなし、bind前/途中取消、待ち期限、途中header/交換の中断、port再利用、遅延応答cancel |
| 資源 | 無通信の未完了header切断、部分接続の破棄、外部Abort購読解除、古い認可処理が新しい待受を閉じない |
| 非出力 | callback/完了通知/JSON/inspect/stdout/stderrに秘密マーカー、state/認可URL、元例外がない |

```bash
bdo npm test -- tests/review/r2-loopback.test.ts
bdo npm run type-check
bdo npm run lint -- --quiet
bdo npm test
bdo npm test -- tests/review/evaluation.test.ts tests/review/oauth-g0.test.ts
bdo npm test -- --maxWorkers=2
bdo npm run build
bdo npm run test:pack
bdo git -c core.fsmonitor=false diff --check
```

- 新規HTTP：1ファイル・46テスト成功。adapterに受理通知中の取消しを確認する回帰1件も追加。
- HTTP/adapter対象回帰：2ファイル・146テスト成功（adapterは100件）。
- TypeScript型検査・ESLint・build・差分チェック成功。
- 梱包：361 files。本番依存だけのインストールと既定worker解析/集約・MCP smoke成功。
  既存`!dist/review/r2-*`と梱包試験により新listenerもnpm非同梱。依存/配布設定変更なし。
- 最終全体回帰：maxWorkers=2で107ファイル・2,721テスト成功（実機E2E・transport専用構成は含めない）。
  テストの制限時間・ケース・期待値は変更していない。

TDDで未実装/未対応の失敗を確認してから、ページ→入力検査→再取得→callback→終了処理と接続した。
同期fetch例外時の受理通知漏れは、adapterの状態を後から推定していたことが原因だったため、
消費時の通知へ変更した。初期lintの未使用importは後続の非露出テストで使用した。
受理通知の中から取消した場合にfetchへ進むことも再現し、送信直前のAbort再確認で通信開始前に止めた。
意図した部分接続の破棄で合成clientにECONNRESETが出たため、client側でその想定されたerrorを処理し、
終了の確認とport再利用を検証した。これをPDIやOAuth認証の不具合とは数えない。

中間の通常並列全体回帰は107ファイル・2,720件で成功したが、adapter回帰1件追加後にbuild/lint/梱包と
同時実行した全体回帰では、既存evaluation.test.tsのCLIテストとoauth-g0.test.tsのtimeoutケースが各5秒を超えた
（2件失敗・2,719件成功）。2ファイルだけの再実行は51件すべて成功した。
同時負荷の影響を疑うが断定せず、テストの制限時間・ケース・期待値を変更しないまま、
他の検証を終えてからmaxWorkers=2で全体を再実行し、107ファイル・2,721件すべて成功した。

46件とadapter回帰1件は回帰ケース数であり、独立ブラインド評価・実ブラウザー挙動・実PDI最小権限の実証ではない。
telemetry保留と実操作の承認ゲートを変更しない。
