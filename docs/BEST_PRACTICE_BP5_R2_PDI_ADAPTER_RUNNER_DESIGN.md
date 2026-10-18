# BP-5 R-2：実PDI OAuthアダプター・runner接続設計

Version: draft-0.3 / Date: 2026-10-18 / Status: アダプター→session接続を内部PoC実装・合成検証。runner未実装、実機/運用は未承認・未検証。

## 1. 範囲と現状

[R-2本人確認/token引渡し設計](BEST_PRACTICE_BP5_R2_IDENTITY_TOKEN_DESIGN.md)の前後を接続する設計案。
実装済みの`R2ReviewSession`と`createR2ReviewBridge`は交換後のtokenを内部で受け取るが、
実PDI用OAuth交換の単体境界は`src/review/r2-pdi-oauth.ts`へ実装し、
`src/review/r2-oauth-session.ts`でsessionの生成・本人確認・固定レビューまで接続した。
HTTP callback待受・runner/SDKとの一連の接続・OS終了signalの処理はまだない。
[40件の合成検証](E2E_BEST_PRACTICE_R2_IDENTITY_SYNTHETIC_2026-10-18.md)を実認証の証拠にはしない。

単体実装の範囲と結果は[合成検証記録](E2E_BEST_PRACTICE_R2_PDI_OAUTH_SYNTHETIC_2026-10-18.md)を参照。
[session接続の合成検証](E2E_BEST_PRACTICE_R2_OAUTH_HANDOFF_SYNTHETIC_2026-10-18.md)では
別アカウントcodeの交換後も本人確認で停止することを確認。実本人性の検証ではない。
runner/設定ファイルを作らず、PDI接続・認可・実token発行・
アカウント/ロール/ACL/登録/設定変更はしていない。telemetry調査・maint担当者への依頼は保留を維持する。
共有REST API Auth Scope/API Access Policyを変更せず、既存service-accountや旧CLIへ代替しない。

R-2コードは現在npm梱包から除外されている。runnerも初期段階はリポジトリ内の未公開PoCとし、
公開CLI/server.tsへ登録したり、配布物へ含めたりする変更は本設計の実装から自動的に導かない。

## 2. 責任分離と固定コンテキスト

| コンポーネント（新設部分は仮称） | 責任 | 禁止する動作 |
|---|---|---|
| PdiOAuthAdapter | 固定PDI・専用client・callback・state/S256、1回の交換、応答検証、交換開始時刻の保持 | 任意endpoint、client secret、refresh、自動再交換、資格情報の公開getter |
| 専用Node runner | 承認済み計画の固定、callback待受、全体Abort/期限、本人操作への引継ぎ、R-2接続・終了 | tokenのargv/env/一時ファイル渡し、汎用サーバー起動、共有instanceの変更 |
| R2ReviewSession（既存） | 固定GET本人確認、不透明permit、固定Update Set・寿命・1レビュー制御 | 自己申告ID/JWTだけの確認、token差替え、認証フォールバック |
| R2ReviewBridge（既存） | SDKの同一プロセスlist/call→既存レビューexecutor→取得/worker | switch_instance、別tool、任意のtoken引数、HTTP/stdio公開 |

runnerは独立した専用Nodeプロセスとして開始し、そのプロセス内で認可・保持・MCP処理を完結する。
認可後にtokenを持つ子runnerを起動する構成ではない。解析workerには従来どおりtokenを渡さない。

承認済みの非秘密計画から、origin、専用client識別子、期待利用者sys_id、Update Set ID、許可規則/上限、
要求scope集合、callback、C方式設定の参照、実行承認の参照を一度だけ読み、検証済みコピーを固定する。
計画の作成/配置も別承認。所有者・書込み権限・サイズ・symlink等は既存の信頼済み設定読込方針を適用し、
新規manifestの具体的なスキーマ/読込器は後続の合成試験で確定する。任意JS/module参照は許さない。
client識別子や利用者sys_idは認証秘密でなくても公開ログへ出さない。tokenは計画に含めない。

提案する起動契約：既定のcheck-planはオフラインで形/期限/対象だけを検査し、bindやブラウザー操作もしない。
実行モードは別の明示操作と実行時承認を必須にし、PDIの必要設定が未承認なら認可前に停止する。
フラグだけを、利用者・登録・ACL作成やtoken発行の包括的な許可とは扱わない。

## 3. 実行シーケンスと開始ゲート

`計画確認 → 明示承認 → callback bind → 本人の認可操作 → 交換1回 → 応答検証 → R-2本人確認 → MCP list/call → cleanup`

開始前に[最小検証計画](BEST_PRACTICE_BP5_OAUTH_MINIMAL_VALIDATION_PLAN.md)の段階別承認を確認する。

1. **R-2構成**：専用利用者・専用ロール・read ACL 2件・専用登録の具体値と復旧が承認されている。
   本書では作成しない。admin/security_admin/cluster_node_adminを検証利用者へ足さない。
2. **本人確認GET**：現在ユーザー式の意味、対象版の評価、自己sys_userの可視性を確認する方法が承認されている。
   事前の仕様確認/ACL照合と、後続の本人tokenによる実機判定を区別する。実機判定に失敗したらレビューへ進まない。
3. **OAuth**：Public Client・S256・固定loopbackの受理/拒否ケース、要求scope、900秒以下の寿命、
   本人ログイン/同意、最大交換回数、発行結果不明時の扱いが承認されている。
4. **秘密管理/終了**：出力先・ブラウザープロファイル・既存のダンプ/診断運用が適合し、cleanup/失効担当が確定している。
5. **C方式**：信頼済み非公開設定・専用instance ID/binding・期限が承認されている。
   正常レビューには固定入力から開始する1回のcallだけを許し、別条件での再実行は新たに承認する。

成立していないゲートを実行時の権限追加・共有scope/policy編集・別資格情報で補わない。
最初の実行は既存Update Set 1件の読み取りのみ。変更methodの拒否試験は行わない。

## 4. callback・ブラウザーとの接続

`http://127.0.0.1:18765/bp5/oauth/callback`を固定し、bind成功後だけ認可操作へ進む。
他port/localhost/IPv6へ自動代替しない。待受は127.0.0.1のみで、LAN/トンネル公開なし。
G0のcallback検査を実PDI用の別アダプターへ移す設計とし、G0の合成issuer制約・固定ケースは変更しない。

- 1プロセス1認可。独立したstate/verifierを生成し、S256を固定する。両値と認可URLをメモリだけに保持。
- GET・固定path・Host・サイズ・queryの許可キー/重複・state・code/error排他を検査する。
  不正callbackは交換せず、正規応答を横取りさせない。正規code/errorは一度だけ消費する。
- state一致のerrorは固定理由で停止し、error_description/error_uriを表示しない。
  issuer等の追加パラメーターを必要とする場合は事前にallowlist/期待値を承認し、未知の値を黙って無視しない。
- 汎用callback完了ページはno-store/referrer-policy:no-referrer、外部資源なし。
  queryの履歴除去はベストエフォートであり、ブラウザー/OSの全履歴から消えたとは保証しない。

### 認可URLをargv/ログへ出さない開始ページ案

自動的に認可URLをOSコマンドのargvへ渡す方式は採らない。同じlistenerに固定の`GET /bp5/start`を追加する案とする。
runnerが案内できるのはこの**非秘密の固定URLだけ**。利用者が管理者cookieと分離した専用ブラウザープロファイルで開く。
ページ内の明示的な「認可へ進む」リンクだけに、メモリ内で組み立てた固定PDI認可URLを含める。
自動redirect・自動submit・手動code貼付け・パスワードの自動入力はしない。

開始ページもHost/path/サイズを固定し、外部からの埋込み・外部資源・キャッシュ・アクセスログを禁止する。
HTML属性の安全な符号化、scheme/origin/pathの固定、予期しないquery/bodyの拒否を合成試験する。
非秘密URLを知っていること自体は認可権限の証明ではない。送信側state/S256/固定clientとcallbackの検証は省略しない。
callback確定・取消・期限で開始ページを含むlistenerを閉じ、重複codeが来ても交換しない。
このページはG0には未実装であり、承認前にブラウザーを開かない。

#### 同一端末の他プロセスによるcode注入・アカウント差替え（2026-10-18追記）

`127.0.0.1`の開始ページは、利用者のブラウザーだけでなく**同じ端末の他プロセス**も取得できる。
ページの認可URLにはstateとS256のcode_challengeが含まれるため、他プロセスがこのURLで**別アカウント**として
PDIにログインし、runnerのchallengeに結び付いたcodeをcallbackへ届けると、runnerのverifierで交換が成立し、
runnerは別アカウントのtokenを保持し得る（authorization code injection / login CSRF）。state/S256だけではこれを防げない。

1. **本人確認を必須の防御とする**：交換後のR-2固定GET本人確認（期待sys_idとの完全一致）を、
   このcode注入・アカウント差替えに対する**省略不可の防御**として位置付ける。本人確認を任意化・後回しにする
   実装、および本人確認前にtokenをレビューや他の用途へ渡す実装はしない。
2. **開始ページは1回限り**：`GET /bp5/start`は最初の1回だけ認可リンクを含むページを返し、以後の取得は
   固定エラーで応答する（認可リンクを再表示しない）。ブラウザーの先読み等で1回目が消費された場合は、
   再表示せずrunnerを固定理由で停止し、新しい認可単位として再承認から始める。1回限りにしても、
   最初の取得が他プロセスに先取りされる可能性は残るため、1.の本人確認が最終的な防御である。
3. **本人不一致は発行済みtokenとして扱う**：`identity_mismatch`は、別アカウントのtokenが**既に発行された**
   可能性を示す。単なる照合失敗として終えず、§7の終了票と§8の発行済み/結果不明tokenの扱い
   （承認済み担当者・手順による失効/同意取消の検討）へ接続する。runnerは自動失効しない。

端末のターミナルにだけ表示する一回限りの乱数付き開始URL（例`/bp5/start/<random>`、ログへは出さない）で
他プロセスの先取りを減らす案もあるが、「非秘密の固定URLだけを案内する」現方針と異なるため、別途判断とする。

## 5. HTTPS交換・応答の受理方針

固定originの`POST /oauth_token.do`へauthorization_code、受信code、固定client ID、
登録と同じredirect_uri、verifierをform-urlencodedで1回だけ送る。client secret/cookieは送らない。
redirect拒否・TLS検証・10秒・解凍後64KiBの上限を適用し、非協調fetch/readerにもAbort競合で停止する。
失敗時はreader/bodyをcancelし、元応答・例外/URL/headers/bodyをログに含めない。

| 項目 | 初期アダプターの受理条件（設計判断） |
|---|---|
| HTTP/形式 | 200、JSON Content-Type、UTF-8正常、オブジェクト、重複キーなし。OAuth errorと成功tokenの混在は拒否 |
| access_token | R2ReviewSessionが受理する文字集合・8192文字上限に一致する非空文字列。token値は変更しない |
| token_type | 文字列、Bearerの大小文字だけを同一視。trimで未知の値を救済せず、token/scopeを小文字化しない |
| expires_in | 1–900の整数。文字列や長寿命を丸めて受理しない。残り時間不足なら本人確認/レビューを開始しない |
| scope明示 | 承認済み要求集合と一致。順序に依存せず、拡大/縮小/未知/空/重複/不正形式は拒否。scopeはGET限定の根拠ではない |
| scope省略 | **初期実装は安全側停止**。要求と同一なら省略可能という仕様上の扱いと、本PoCの受理条件を分ける |
| refresh/未知フィールド | refreshは利用/保存せず破棄。追加標準フィールドは事前allowlistと型/上限を決め、未知の構造を後段へ渡さない |

scope省略で停止することはServiceNow/RFC不適合の判定ではない。
将来受理するには、専用登録の許可scope・固定要求・実応答の対応と根拠を確認し、明示的な別ポリシーとして
承認・合成試験する。省略された値を無条件に要求scopeで補完する実装にはしない。
Bearer大小文字対応も実PDI用だけで、既存G0の完全一致契約/42ケースは変更しない。

## 6. R-2 sessionへ渡す所有権

アダプターが公開する操作は「検証済み交換結果を信頼済みrunner内で一度消費する」内部操作だけとし、
token文字列/認可URLを返す公開getterやシリアライズ可能な結果は作らない。
runnerが`R2ReviewSession`へ渡す値は次の対応で固定する。

| R2SessionConfig | 取得元 |
|---|---|
| instanceUrl / clientId / expectedUserSysId / updateSetSysId | 開始前に承認した不変計画。token応答やtool引数から上書きしない |
| bearerToken / expiresInSeconds | 検証済みの今回の交換応答だけ |
| issuedAt | **交換要求開始直前**のperformance.now。同一プロセスで使い、交換完了時にリセットしない |
| reviewReleaseConfig | 承認済み専用C方式の設定コピー。token応答/本人の自己申告から作らない |

session生成後、アダプターのtoken・code・verifier等への参照を手放すが、成功した所有権移譲を
全体Abort/取消と混同しない。アダプターのlistener cleanupが新sessionのroot signalを誤ってAbortしない構造にする。
runnerは初期化途中で失敗しても最後の所有者が分かるよう、adapter/session/bridgeを独立してfinally管理する。
JSでは文字列のコピーを禁止/完全消去できない。移譲後のraw応答バッファ等を保持する設計を避け、
テストでは他所有者にtokenが残らない経路と公開出力の非露出を確認する。

session.verify()が成功した場合だけpermitをcreateR2ReviewBridgeへ渡す。
SDKでlistの対象toolを確認し、固定argsでcallを1回行う。本人性不明ならmetadata/payloadを取得しない。
本人確認成功でもC方式のrelease gateを省略せず、assertedはpartialで報告する。
次の認可やC方式異常系を自動的に追加実行しない。

## 7. runnerの期限・失敗・出力

設計上限は、認可待ち300秒、交換10秒、本人確認10秒、BP-5全体60秒、cleanup 3秒。
root実行期限はbind開始から385秒とし、各段階はその残り時間と段階上限の小さい方まで。
上限は別々に延長せず、本人確認/交換の時間もtoken寿命から消費する。
BP-5開始前は既存sessionの厳密な残り60秒超・C方式の全体期限を覆う有効期間の両方が必要。

| 失敗境界 | 固定報告の例 | 後続 |
|---|---|---|
| 計画/承認/環境不備 | preflight_failed / approval_required | bind/認可なし |
| bind不可・認可取消/期限 | callback_unavailable / authorization_denied / authorization_timeout | 交換なし |
| 交換を開始後にtimeout/通信結果不明 | exchange_outcome_unknown | 発行済みの可能性を残す。同じcodeの再送・新規認可・自動失効はしない |
| 明示的な交換拒否・応答不正 | exchange_rejected / invalid_token_response | tokenをレビューへ渡さない。応答不正でもサーバー発行なしとは断定しない |
| 本人確認/レビュー | 既存R-2の固定理由/既存BP-5結果 | 元例外や本人IDを追加しない |
| 本人不一致 | identity_mismatch | 別アカウントのtokenが発行済みの可能性（§4のcode注入）。レビューへ進まず、終了票に「別アカウントtoken発行の可能性」を固定boolで残し、§8の失効検討へ接続する |
| cleanup未確認 | cleanup_incomplete | 成功報告を取り消し、独立した失敗として残す |

固定理由はrunner用の新設案で、0.2/0.3 JSON契約へ追加したものではない。
成功時は既存contractで検証したcode_return_mode=noneの結果だけを出力し、token/code/state/verifier/認可URL、
本人ID・client ID・ヘッダー・原応答・例外causeを付加しない。出力直前の秘密一致ガードは置換で救済せず、
検知時は固定失敗だけを出す。テスト時の秘密マーカー検査は実環境の完全漏えい防止の証明ではない。
保存先は別承認。既定で結果や秘密をファイルへ保存しない。

## 8. 終了signal・破棄・発行済みtokenの扱い

runner開始時にSIGINT/SIGTERM・予期しない例外を1つのroot停止経路へ集約する設計とする。
raw例外/stackを標準出力しない。対象はこの専用runnerプロセスだけで、共有アプリへ終了handlerを追加しない。

1. 新規認可/交換/callを禁止し、最初の停止理由を固定する。
2. root Abortを伝播し、callbackを閉じ、adapterのpending fetch/readerを中止する。
3. bridge.close()/session.close()で解析/集約worker終了と取得枠解放を待つ。
   session側2秒のcleanup上限を、runner全体の3秒以内に収める。重複closeを直列に何度も待たない。
4. 所有者ごとにtoken/code/state/verifier、buffer、permit、タイマー/購読/待受参照を破棄する。
5. cleanup確認後だけ正常終了。3秒を超えたらcleanup_incompleteとし、専用runnerの強制終了で残存workerを止める
   方針を別途試験する。ライブラリや親アプリを終了させる処理にはしない。

SIGKILL/クラッシュで通常cleanupを保証しない。既存のdump/診断運用が秘密管理要件を満たさなければ開始を止め、
OS設定を勝手に変えない。ローカル終了・登録無効化・サーバーtoken失効は別の状態である。
発行済み/結果不明tokenの失効・同意取消は承認した担当者/手順で扱い、runnerが自動操作しない。
refreshが返っても使用しないが、サーバー上で発行され得る残存リスクは終了票に固定bool/未確認として残す。
`identity_mismatch`で終わった場合も、検証利用者以外のアカウントのtokenが発行済みであり得るため、
発行済み/結果不明tokenと同じく失効・同意取消の検討対象とする（対象アカウントの特定は承認済み担当者が行い、
runnerは本人IDや対象を出力・自動操作しない）。

## 9. 実装前に確定する契約と合成試験

アダプター単体とsessionへの所有権移譲・本人確認を実装・合成検証済み。
以下のうち開始ページ/HTTP待受/manifest読込、runner/SDK接続・終了プロセス試験は未実施のまま。

- 信頼済みmanifestスキーマ、開始ページ/callbackの制約、追加OAuthフィールドallowlist、scopeの字句検査。
- 開始ページの2回目以降の取得が固定エラーで、認可リンクを再表示しない。1回目を先取りされた場合に停止する。
- runnerのchallengeに結び付いた別アカウントのcodeを注入する合成ケースで、交換は成立しても本人確認が
  `identity_mismatch`で止まり、レビュー/metadata取得が一度も始まらず、終了票に発行済みの可能性が残る。
- HTTPS固定/redirect・cookieなし、Bearer大小文字、scope明示一致と省略拒否、寿命/重複キー/UTF-8/64KiB境界。
- token交換は最大1回。timeout後の遅延成功、cancelと交換成功/移譲の競合で、レビューが二重に始まらない。
- G0の合成issuerと実PDI用固定HTTPS originを混同しない。テストは信頼済みHTTP境界注入で外部接続を拒否する。
- adapterのlistener終了がsessionを誤取消しない、同じtoken/origin/開始時刻が保たれる、本人確認失敗ならcallなし。
- SDK list/call・C方式・実workerをつないだ合成試験。client切断/認可待ち/交換中/本人確認中/CPU中の停止。
- 子プロセス試験では秘密は子の中で生成する合成値のみ。argv/envにtokenを渡さず、SIGINT/SIGTERM、終了code、
  worker/port/タイマー/購読の解放、stdout/stderr/結果/失敗の秘密非露出を確認する。
- 既存G0、R-2 40件、0.2/0.3契約、固定評価セット、stdio/HTTP合成E2E、npmのR-2非同梱を維持する。

根拠・実機留保は[専用OAuth設計§9](BEST_PRACTICE_BP5_PER_USER_OAUTH_DESIGN.md)に従う。
scope省略、G0との互換性、R-2の本人確認GET、開始ページ、385秒/3秒の上限は本PoCの設計判断であり、
ServiceNowで受理/動作したという記録ではない。実機・発行・設定作成は本計画の実装承認とも分けて扱う。

## 10. 単体実装の具体的な境界（2026-10-18）

- `R2PdiOAuthAdapter`は信頼済み計画由来のcanonical HTTPS origin・client ID・scope集合をコピーして固定。
  呼出し単位でendpoint/redirect URIを変更できず、生成時はネットワーク/待受/ファイルアクセスなし。
- `withAuthorizationRequest`は信頼済み内部consumerへ認可URLを1回だけ渡す。公開getterなし。
  state/verifierはそれぞれ32 random bytes、S256固定。未実装の開始ページやHTTPアクセス制御を代替しない。
- `exchangeCallback`は固定pathのGET request-targetを検証する単体境界で、Host/method/body/raw headerの
  検査は将来のHTTP listenerの責任。URL文字列を受け取れることを手動code入力や実認可の許可と扱わない。
- 交換は固定POST 1回、redirect拒否、cookie/secretなし。10秒・解凍後64KiB、Abort競合による非協調処理の停止。
  Content-Lengthだけに頼らず実chunkを数える。失敗/中断後の再交換・遅延成功からの復活なし。
- JSONは重複キー（エスケープ同名も含む）・不正UTF-8を拒否。許可fieldは
  `access_token/token_type/expires_in/scope/refresh_token`だけで、値は所定のscalar型/上限に限定する。
  refreshは存在する場合だけtoken文字集合/8192文字上限を確認して捨て、利用/引渡し/更新しない。
  scope省略は拒否、明示値は順序に依存しない厳密な集合一致。未知fieldやerror混在も拒否する。
- `consumeToken`は信頼済み内部consumerに`bearerToken/expiresInSeconds/issuedAt`だけを1回渡す。
  issuedAtは交換開始の単調時刻、寿命は5秒の余裕を差し引く。残り寿命のreview開始ゲートは既存sessionの責任。
  callbackの戻り値は公開しない。成功/失敗/取消/期限で参照とtimer/購読を除去し、公開結果は固定理由のみ。
- adapter内部のAbortSignalをsessionへ渡さない。所有権移譲成功時のadapter cleanupでrunnerのroot signalを
  Abortしない。非協調consumerが既にコピーした文字列/参照やOSメモリの完全消去は保証しない。
  session生成・本人確認を経ずにレビューへ進ませない接続試験は§11と接続検証記録を参照。
- HTTP待受、HTML、ブラウザー起動、承認manifest、SIGINT/SIGTERM、R-2/MCP連携、終了票、
  サーバー側失効は未実装。特に§4の同一端末code注入対策は、単体交換の成功だけでは成立しない。

## 11. メモリ内session接続（2026-10-18）

内部の`R2OAuthSessionConnection`がadapter/session/permitを所有する。開始時に計画をコピーし、
同じ固定origin・client・期待利用者・Update Set・C方式設定を使う。入力でtokenやsessionを供給する口はない。
tokenの一度限りのconsumerではsession生成だけを行い、adapterの成功cleanup後に固定GET本人確認を実施。
adapterの内部AbortSignalはsessionへ渡さず、接続層の独立したroot signalを共有する。

`exchangeAndVerify`の成功は`{ok:true}`だけで、token/session/permitを返さない。
本人確認成功後だけ内部permitを保存し、`review`が1回消費する。取得・解析・0.2/0.3契約は既存sessionを使う。
接続層のreviewは内部executorへの直接接続で、SDK list/callやOS runnerの実装ではない。
本人確認失敗・認可失敗・期限・取消は安全側停止し、token・permit・timer・外部Abort購読を破棄する。
認可待ちは最大300秒、交換/本人確認/レビューは既存の段階上限を維持する。385秒のrunner監督は未実装。

状態/JSON/inspectにはphase・hasCredentialと次のboolだけを出す。終了票/公開JSONへの追加ではない。

- `tokenMayHaveBeenIssued`：token POSTを開始した時点でtrue。通信結果不明/取消/不正応答を「未発行」としない保守的な記録。
- `otherAccountTokenPossible`：固定GETが期待IDと不一致だったときtrue。別アカウントのtokenの可能性を残し、
  自動失効・新規認可・別資格情報への切替はしない。

この接続試験は正しいstate/S256を持つ別アカウントcodeの交換成立を模し、本人確認で止める。
開始ページの一度限り表示・同一端末の先取り・HTTP Host検査は未実装であり、防御全体の完了とは扱わない。
JS/HTTP実装のコピーやOSメモリの完全消去、サーバーtoken失効は保証しない。
