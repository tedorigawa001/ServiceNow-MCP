# BP-5 G0：ローカル合成OAuthハーネス検証

Date: 2026-10-18 / Status: ローカル合成試験。PDI認可/トークンE2Eではない。

## 1. 範囲

[最小検証計画](BEST_PRACTICE_BP5_OAUTH_MINIMAL_VALIDATION_PLAN.md)のG0として、
`tests/helpers/bp5-oauth-harness.ts`と`tests/review/oauth-g0.test.ts`を追加。
ハーネス・合成サーバーは127.0.0.1だけを使用し、PDI origin・localhost名・別IP・資格情報付きURL・
path付きoriginを拒否する。ブラウザー起動、OAuth登録作成、実code/token発行、PDI API取得、
アカウント/ロール/ACL/設定変更は実装/実行していない。実在の資格情報を読み込まない。

本番CLI・MCPの認証経路に接続せず、npm配布対象のsrc/distへ追加しない。
合成tokenはテスト用の架空文字列。実際のAuthorization Code登録で使えるハーネスではない。

## 2. 実装した境界

| 項目 | 実装/合成試験 |
|---|---|
| callback | IPv4 loopbackへ先にbind。既定port18765、並列合成試験のみport0。競合時は固定エラーで停止し、別portへ自動代替しない |
| 入力 | GET・Host・raw path・query/state形式を検査。absolute-form/正規化で紛れるpath/重複query/codeとerror併記/過大入力を拒否 |
| state | 独立したCSPRNG32byte、hex64文字。形式/長さの検査後にconstant-time比較。不正callbackで正当な待受を消費しない |
| PKCE | 独立したCSPRNG32byteのbase64url verifier、SHA-256/base64urlのchallenge、method=S256。平文/省略への降格口なし |
| 一回性 | 認可URLの引渡しは一度。正常callbackを同期的に消費してから交換し、交換中の再送は拒否。自動再試行なし |
| 交換 | 固定の合成originと/oauth_token.doへPOST。client/scope/callback固定、client secretなし、redirect追随なし |
| 応答上限 | 認可待ち5分、交換10秒、token応答64KiB（Content-Lengthと実際のstreamの双方）。テストでは短い期限へ縮小可能、上限の拡大不可 |
| token検査 | Bearer、印字可能ASCII/長さ、正の整数expires_in（最大900秒）、専用scopeの完全一致。欠落/拡大scope等は拒否 |
| メモリ管理 | access tokenだけをprivate fieldで保持。refreshは保存/使用しない。単調時計で交換開始を基準に1秒の余裕を引き、ローカル保持上限との早い方 |
| 利用 | 信頼した同一プロセスconsumerにtokenとAbortSignalを一時引渡し。同時貸出を拒否し、開始/終了の両方で期限を確認 |
| 終了 | 成功/拒否/期限/キャンセル時に待受を閉じる。disposeで参照/タイマー/abort listenerを解放、交換をabortしてtask終了を待つ。token期限/取消でconsumerにもabort通知 |
| 非出力 | 例外・結果・JSON/inspectは固定語彙だけ。HTTP本文にquery/code/error_descriptionを反映せず、no-store/no-referrer/CSPを設定 |

callbackページは静的なquery除去用history.replaceStateを含む。テストはHTTP本文とヘッダーを確認するが、
実ブラウザーでのJavaScript実行/CSP動作やブラウザー履歴全体の削除は確認していない。

## 3. 合成テスト

実HTTPのループバックissuer/callbackと、実子プロセスの標準出力を使用。内部関数のmockではなく、
HTTP境界、token利用口、completion/disposeを検証する。時間境界の1件のみperformance.nowを固定する。

- 正常S256：合成issuerが受け取ったverifierのhashをchallengeと照合し、callback/client/grantも照合。
- 不正callback10種類：state不一致、state/code重複、code/error併記、method、path、正規化path、Host、absolute URI、サイズ超過。
- 接続先拒否6種類：外部HTTPS、localhost、別loopback IP、path付き、資格情報付き、不正URL。
- token metadata拒否9種類：scope欠落/広域/追加、type、寿命上限/ゼロ/型、空/制御文字token。
- token応答拒否5種類：宣言サイズ、stream実サイズ、redirect、JSON破損、サーバーエラー本文。
- その他：認可拒否の非反射、待受期限、交換期限、交換中キャンセル/再送、port競合、
  token期限/利用中期限境界、consumerキャンセル/同時利用拒否、consumer例外の固定化、終了後のport再利用。
- 子プロセスにstate/verifier/access/refresh/code/consumer例外の合成canaryを置き、
  stdoutが固定summary1行のみ・stderrが空であることを確認。JSON/inspect/HTTP本文も非露出を確認。

TDDで最初の未実装失敗、正常系未対応失敗、不正callback拒否の失敗、期限境界の失敗を観測して実装した。
交換期限テストの初版ではvi.waitForの既定50ms間隔が40ms期限を超え、再送時に接続拒否になる競合を観測。
合成issuer受信イベントへ同期を変えて解消し、本体の期限は緩めていない。

## 4. 検証コマンドと結果

shellはリポジトリ指示どおりbdo経由。実HTTPを使う合成試験にはloopback listen権限が必要。
制限環境でのcallback_unavailableをPDIの設定不具合と解釈しない。

| コマンド/検証 | 結果 |
|---|---|
| `bdo npm run test:review:oauth:g0` | G0専用の42ケース。下記全体実行にも含む |
| `bdo npm test` | 102ファイル、2,506件成功。PDI E2Eは対象外 |
| `bdo npm run type-check` | 本番srcの型検査成功 |
| 新規3ファイルのtsc直接検査（ES2022/ESNext/bundler/strict/skipLibCheck） | 成功 |
| 新規3ファイルのeslint | 成功 |
| `bdo npm run test:pack` | production-only install/worker解析・集約・dispatch成功、361ファイル。全tests配下非同梱の既存assertによりG0も非同梱 |

テスト全体用`tsconfig.eslint.json`をtscに渡す追加調査では既存ファイルの型エラーがあり、成功ではない。
TypeScript APIで新規3ファイルを含む場合/除く場合を比較すると、双方110診断・追加診断0・新規ファイル診断0。
本変更でその既存課題を修正したとはしない。標準の本番type-checkと混同しない。

## 5. 限界と次の承認

- G0のローカル構成要素を確認しただけで、PDIのS256強制・loopback受理・GET制限は全件未実証。
  最小検証計画のP/L/Sケースを実行済みに変更しない。
- 実PDI用HTTPSアダプター、本人確認、scope省略時の確認、安全な実MCPへの引渡しは未実装。
  synthetic origin制限を外して実環境へ接続する変更は別設計/試験/承認を必要とする。
- **token_type**：現G0は`'Bearer'`との完全一致。
  [RFC 6749 §5.1/§7.1](https://www.rfc-editor.org/rfc/rfc6749.html#section-7.1)の大小文字非区別に合わせ、
  実アダプターでは文字列型を検査してからBearerを大小文字非区別で比較する設計とする。
  今回はG0の実装・採点条件・テスト結果を変更しておらず、RFC一般への適合試験とも主張しない。
- **scope省略**：[RFC 6749 §5.1](https://www.rfc-editor.org/rfc/rfc6749.html#section-5.1)では要求と同じなら省略可。
  現G0の欠落拒否は合成契約としての厳格化。実PDIでの省略の有無や、要求範囲を実効scopeと扱える条件は未確認で、
  G2以降の承認済み検証と[設計書§4.1](BEST_PRACTICE_BP5_PER_USER_OAUTH_DESIGN.md)で確定する。
  検査を単に削除したり、GET成功だけからscope一致/GET限定を推定したりしない。
- **固定port**：18765・競合時停止はクライアント側の方針として維持。
  合成試験のport0は並列試験用であり、実PDI向けの自動port変更ではない。
  [RFC 8252 §7.3/§8.4](https://www.rfc-editor.org/rfc/rfc8252.html#section-7.3)にはloopbackのport例外がある。
  PDIでport込み完全一致が強制されることは未検証で、別port受理だけでは安全性不合格にしない。
- completion=readyは過去の合成交換の完了だけを表す。現在のtoken利用可否は期限/取消を確認するuseToken側で判定。
- 信頼したconsumerが受け取った文字列をコピー/ログ出力することや、協調しないconsumerを強制終了することは防げない。
  AbortSignalの協調が前提。JavaScriptヒープ/クラッシュダンプの完全消去・既発行tokenのサーバー失効も保証しない。
- 秘密非出力の主張はハーネスの管理する出力と検証した合成経路に限定する。OS/ブラウザー/外部issuer全体のログ保証ではない。
- G0の人の承認、G1以降の棚卸し・登録/共有変更・認可/発行の承認は未完了。
