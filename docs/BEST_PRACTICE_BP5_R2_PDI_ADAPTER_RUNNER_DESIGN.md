# BP-5 R-2：実PDI OAuthアダプター・runner接続設計

Version: draft-0.7 / Date: 2026-10-18 / Status: 内部runner接続・起動取消競合のcleanup待機を合成検証。公開CLI・実機/運用は未承認・未検証。

## 1. 範囲と現状

[R-2本人確認/token引渡し設計](BEST_PRACTICE_BP5_R2_IDENTITY_TOKEN_DESIGN.md)の前後を接続する設計案。
実装済みの`R2ReviewSession`と`createR2ReviewBridge`は交換後のtokenを内部で受け取るが、
実PDI用OAuth交換の単体境界は`src/review/r2-pdi-oauth.ts`へ実装し、
`src/review/r2-oauth-session.ts`でsessionの生成・本人確認・固定レビューまで接続した。
固定HTTP callback待受・開始ページは`src/review/r2-loopback.ts`へ実装した。
runner/SDKとの一連の接続・OS終了signalの処理は内部APIとして実装した（§14）。公開CLIはない。
[40件の合成検証](E2E_BEST_PRACTICE_R2_IDENTITY_SYNTHETIC_2026-10-18.md)を実認証の証拠にはしない。

単体実装の範囲と結果は[合成検証記録](E2E_BEST_PRACTICE_R2_PDI_OAUTH_SYNTHETIC_2026-10-18.md)を参照。
[session接続の合成検証](E2E_BEST_PRACTICE_R2_OAUTH_HANDOFF_SYNTHETIC_2026-10-18.md)では
別アカウントcodeの交換後も本人確認で停止することを確認。実本人性の検証ではない。
[待受・開始ページの合成検証](E2E_BEST_PRACTICE_R2_LOOPBACK_SYNTHETIC_2026-10-18.md)は実TCPを使うが、
外部PDI通信は合成fetchのみ。実ブラウザーでの認可操作はしていない。
実運用の設定ファイルを作らず、PDI接続・認可・実token発行・
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
要求scope集合、callback、C方式設定、実行承認の参照を読み、検証済みコピーを固定する。
計画の作成/配置も別承認。所有者・書込み権限・サイズ・symlink等は既存の信頼済み設定読込方針を適用し、
具体的なスキーマ/読込器と消費直前の再検証は§13に定義した。任意JS/module参照は許さない。
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

自動的に認可URLをOSコマンドのargvへ渡す方式は採らない。同じlistenerに固定の`GET /bp5/start`を内部PoCとして実装した。
runnerが案内できるのはこの**非秘密の固定URLだけ**。利用者が管理者cookieと分離した専用ブラウザープロファイルで開く。
ページ内の明示的な「認可へ進む」リンクだけに、メモリ内で組み立てた固定PDI認可URLを含める。
自動redirect・自動submit・手動code貼付け・パスワードの自動入力はしない。

開始ページもHost/path/サイズを固定し、外部からの埋込み・外部資源・キャッシュ・アクセスログを禁止する。
HTML属性の安全な符号化、scheme/origin/pathの固定、予期しないquery/bodyの拒否を合成試験する。
非秘密URLを知っていること自体は認可権限の証明ではない。送信側state/S256/固定clientとcallbackの検証は省略しない。
callback確定・取消・期限で開始ページを含むlistenerを閉じ、重複codeが来ても交換しない。
G0は変更せず、独立した待受PoCで合成検証する。承認前に実ブラウザーを開かない。

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
内部runnerは最後の3秒をcleanup用に確保し、作業は382秒で打ち切る（§14）。
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
開始ページ/HTTP待受も合成検証済み。以下のうちmanifest読込、runner/SDK接続・終了プロセス試験は未実施のまま。

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
- HTTP待受/HTMLは独立したlistener（§12）に実装し、単体adapterには含めない。
  manifestからのrunner接続、SIGINT/SIGTERM、R-2/MCP連携、固定終了票は§14に実装した。
  自動ブラウザー起動・公開CLI・サーバー側失効は実装しない。
  特に§4の同一端末code注入対策は、単体交換の成功だけでは成立しない。

## 11. メモリ内session接続（2026-10-18）

内部の`R2OAuthSessionConnection`がadapter/session/permitを所有する。開始時に計画をコピーし、
同じ固定origin・client・期待利用者・Update Set・C方式設定を使う。入力でtokenやsessionを供給する口はない。
tokenの一度限りのconsumerではsession生成だけを行い、adapterの成功cleanup後に固定GET本人確認を実施。
adapterの内部AbortSignalはsessionへ渡さず、接続層の独立したroot signalを共有する。

`exchangeAndVerify`の成功は`{ok:true}`だけで、token/session/permitを返さない。
本人確認成功後だけ内部permitを保存し、`review`が1回消費する。取得・解析・0.2/0.3契約は既存sessionを使う。
接続層のreviewは内部executorへの直接接続で、SDK list/callやOS runnerの実装ではない。
本人確認失敗・認可失敗・期限・取消は安全側停止し、token・permit・timer・外部Abort購読を破棄する。
認可待ちは最大300秒、交換/本人確認/レビューは既存の段階上限を維持する。385秒のrunner監督は§14を参照。

接続層の状態/JSON/inspectにはphase・hasCredentialと次のboolだけを出す。§14の終了票にも固定boolを使うが、BP-5公開JSONは変更しない。

- `tokenMayHaveBeenIssued`：token POSTを開始した時点でtrue。通信結果不明/取消/不正応答を「未発行」としない保守的な記録。
- `otherAccountTokenPossible`：固定GETが期待IDと不一致だったときtrue。別アカウントのtokenの可能性を残し、
  自動失効・新規認可・別資格情報への切替はしない。

この接続試験は正しいstate/S256を持つ別アカウントcodeの交換成立を模し、本人確認で止める。
開始ページの一度限り表示・HTTP Host検査は§12で合成検証したが、同一端末の先取り防止や
実ブラウザーでの防御全体の完了とは扱わない。
JS/HTTP実装のコピーやOSメモリの完全消去、サーバーtoken失効は保証しない。

## 12. 固定ループバック待受と開始ページ（2026-10-18）

`R2LoopbackListener.start`は内部接続層を所有し、127.0.0.1:18765だけにbindする。
公開CLI/MCPからは未接続で、port/hostの変更口・自動fallback・自動ブラウザー起動はない。
startはローカルbindだけで、ページ取得も単に認可リンクを返すだけ。実PDIへの交換には正規callbackが必要。

- Hostはraw headerで1件かつ`127.0.0.1:18765`完全一致。GETのみ、bodyなし（Content-Length未指定または0、TEなし）を
  確認してから要求のendを待つ。固定path以外、開始URLのquery/fragment/絶対形式は拒否する。
- Host/path/body不正は400、method不正は405。CONNECTも405、Upgradeは400、Expectは417で拒否する。
  NodeのHTTP parserによる不正framing/過大headerの拒否も利用する。raw packetや例外を出力しない。
- 開始ページへのforeign Origin/cross-site要求は403、prefetch/prerenderは400。callbackはPDIからの正規cross-site
  navigationを想定し、cross-siteという理由だけでは拒否しない。Host/state/code/error/PKCE/本人確認は省略しない。
- `GET /bp5/start`だけが認可リンクを1回表示する。URLをHTML属性として符号化し、明示的なリンククリックのみ。
  再取得はリンクなし409にし、`start_page_reused`で認可単位全体を停止。自動再表示/再認可はない。
- 正規callbackの消費はadapter内で一度だけ通知し、同期的な通信例外でも受理済み/未受理を混同しない。
  browserへは認可/本人確認の成否を含まない汎用ページだけを返す。固定hashのhistory.replaceStateだけを許可する。
  応答のfinish/close後にHTTP待受を閉じ、交換/本人確認を待つ。成功cleanupでsessionのrootを誤取消しない。
- 全ページはno-store/referrer-policy:no-referrer/nosniff、CSP default-src/base-uri/form-action/frame-ancestorsをnone。
  外部資源/自動redirect/フォーム/アクセスログ/CORS許可なし。状態/JSON/inspectへ認可URLやcodeを含めない。
- header上限8KiB、target上限8KiB、接続数16、1socket1request。socket無通信2秒とNodeのheader/request timeout設定2秒。
  無通信timeoutは2秒の総実行期限という意味ではない。認可待ち全体は既存どおり最大300秒。
- 外部Abort・明示close・期限はsessionも停止。closeは全HTTP/未完了/upgrade socketを破棄してbind解放を待つ。
  ポート競合はcallback_unavailableで停止し、他の待受を閉じたり別ポートを選んだりしない。

`completion`は認可/本人確認の完了通知で、レビュー/runner全体の最終結果ではない。
成功後もsessionを内部保持するため、呼出し元はfinallyで必ずcloseする。tokenのローカル破棄は失効ではない。
単体listenerはHTTPから本人確認までを担当する。review/SDKへ進むrunnerとmanifestの接続、OS signal、
385秒の全体監督と固定終了票は§14を参照。実機の登録/発行/ブラウザー操作を許可するものではない。

## 13. 承認manifestのオフライン契約（2026-10-18）

`src/review/r2-approval-manifest.ts`にstrict Zod schemaとdraft-7 JSON Schema、
`loadR2ApprovalManifest`を実装した。[合成検証記録](E2E_BEST_PRACTICE_R2_APPROVAL_MANIFEST_SYNTHETIC_2026-10-18.md)を参照。
これは内部の非秘密入力であり、署名付き承認証明・実行許可・CLIではない。実manifestの作成/配置はしていない。

### 13.1 必須field

すべてのobjectは未知field拒否、既定値なし。sys_idは小文字32桁hex、bindingは小文字64桁hex。

| field | 契約 |
|---|---|
| `schema_version` | `bp5-r2-approval-0.1`固定 |
| `approval` | `reference`（英数字開始・英数字/`._:-`・200文字以内）、ISO UTCの`approved_at/expires_at`。参照だけで人の承認内容は証明しない |
| `instance_id/instance_binding` | 専用接続IDと`createReviewInstanceBinding(ID, canonical HTTPS origin)`。IDは英小文字開始・小文字/数字/`_-`・64文字以内 |
| `callback_uri` | `http://127.0.0.1:18765/bp5/oauth/callback`固定 |
| `plan` | `instanceUrl/clientId/scopes/expectedUserSysId/updateSetSysId/reviewReleaseConfig`。HTTPS originのみ（path/query/userinfo/末尾slashなし）。client IDは印字ASCII 256文字以内 |
| `plan.scopes` | RFC scope文字集合、各256文字以内、1〜16件、重複なし、空白区切り合計1024文字以内。実PDIでscopeが有効であることは別確認 |
| `plan.reviewReleaseConfig` | C方式の非秘密snapshotを同じmanifestに埋め込む。別ファイル参照やenv探索はしない。`instance_id`必須、`assertion`は既存契約の任意値 |
| `review` | `update_set_sys_id/selection_mode/max_records/requested_rule_ids`必須。対象IDはplanと一致。selectionは`bounded_all/review_targets`、件数1〜100、規則は実装済み3件の空でない重複なし集合 |

token・client secret・パスワード・任意query・module/コード・任意endpointは受け付けない。
JSON Schema単独ではファイル信頼性、cross-field整合性、期限、bindingは検証できず、必ず読込器を通す。

### 13.2 信頼済み読込と期限

- 呼出し元が指定した正規化済み絶対pathのみ。path上限4096文字、NULなし。既定path探索/環境変数/自動作成/権限修復なし。
- 既存`readTrustedConfigJson`のPOSIX方針を利用する。通常ファイル、実行UID所有、mode 0600、特殊permission bitsなし、
  hardlink数1、leaf/祖先のsymlink拒否。祖先はrootまたは実行UID所有、group/other書込み不可。
  ACLは既存の固定コマンドで検査し、付与ACLや検証不能を拒否。Windows/ACL検査不能もfail-closed。
- `O_NOFOLLOW`で開き、FD/パス/祖先のidentity・stat・ACLを前後照合、finallyでFDを閉じる。
  UTF-8・64KiB以内の実読取量、JSON構文、全objectの重複キー（Unicode escape同名含む）、構造深度64以内を検査する。
  既存設定の1MiB上限/重複キー動作は変更せず、この厳格化はmanifest用opt-in。
- 承認日時は読込時刻以前、有効期限は日時より後。承認期限と、存在するC方式assertionの期限は
  **検査時刻+385秒より厳密に後**を必須とする。等値も拒否。C方式の将来日時・bindingも既存検証器で確認する。
- manifestのslot、C設定のslot、接続先bindingを照合する。`assertion`なしは実測のみを要求する入力として許可するが、
  読込成功をリリース`matched`と扱わない。実測との競合/不明/不一致は従来のrelease gateで停止する。

### 13.3 一度限りの消費・失敗時停止

読込handleはraw getterを持たず、状態/JSON/inspectは`state/hasSnapshot`だけを返す。
`consume`は内部の信頼済みconsumerにdeep-freezeした計画・review・承認参照・bindingを1回だけ渡す非同期API。
消費を先に確定してから、同じファイルを再度安全に読み、期限・bindingと読込時以降の時計を検証する。
正規化したschema結果のSHA-256が初回と違えば`manifest_changed`で停止する（署名ではない）。
空白だけの変更は許容するが意味の変更を黙って採用しない。ファイル/期限/時計/consumer失敗は固定codeのみ。
path、値、Zod issue、ファイル例外、consumer例外や戻り値を結果に出さず、失敗後の再消費やfallbackなし。

消費開始時/closeで保有snapshotへの参照を除去し、consumerへ渡す直前にpath/hashも除去する。
consumerは同期例外・非同期rejectとも固定`manifest_consumer_failed`に変換する。消費後のsnapshotは固定し、
稼働中にファイル変更を追従する設計ではない。consumer自身の取消/期限/cleanupは後続runnerの責任。
同一UID/管理者侵害、信頼時計の改変、検査後の全OS競合を完全防止するものではなく、人の承認の真偽も検査しない。
信頼済みconsumerのコピーやJS/OSメモリの完全消去も保証しない。

runner/listener/SDKへの接続、385秒の全体監督・OS signal・終了票は§14へ実装した。
実行時の個別承認は未実施。この読込成功だけではbind・認可・発行・実機操作を始めない。
telemetry調査は保留を維持する。

## 14. 内部runnerの接続と合成検証（2026-10-18）

`src/review/r2-runner.ts`の`runR2ApprovalManifest(path, options)`が、
信頼済み読込→消費直前の再検証→固定listener→OAuth交換→固定GET本人確認→MCP list/call→cleanupを接続する。
[runner合成検証記録](E2E_BEST_PRACTICE_R2_RUNNER_SYNTHETIC_2026-10-18.md)を参照。
公開CLI/check-plan/自動起動/ブラウザー操作は追加しない。`server.ts`・HTTP/stdio・npm配布物への登録もない。
実manifestの配置やPDIの実行許可を、この内部APIの存在やmanifest成功から導かない。

### 14.1 固定条件・所有権

- manifestの固定snapshotだけを使う。runnerへtoken/任意tool/任意review argsを渡す口はなく、
  `onReady`へ渡すのは非秘密の固定start URLだけ。認可URL・session・permit・bridgeの公開getterはない。
- listenerの内部connectionが本人確認済みsession/permitを所有し、`reviewViaMcp`でpermitを1回消費する。
  同一プロセスのSDK/InMemoryTransportでlistを行い、toolが1件・固定名・readOnlyであることを確かめ、
  manifestのreview条件でcallを1回行う。直接executorに迂回しない。
- list/call中もroot Abortを共有し、tokenは同じsession/bounded取得だけに使う。workerに渡さない。
  bridge生成と取消の競合でも、遅れて生成されたbridgeを閉じる。list成立のboolはcall失敗後も保持する。
- 認可待ちのHTTP終了とsessionの終了を分ける。callbackでportを解放しても本人確認済みtokenはreview完了まで保持し、
  runnerのfinallyでlistener/connection/session/bridgeを冪等に閉じる。

### 14.2 全体期限・中断

bind開始直前に単調時刻を固定し、全体385,000ms、cleanup最大3,000msを設定する。
作業期限382,000msで新規作業/結果採用を止めrootをAbortし、残り3秒以内でcleanupを待つ。
既存の300秒/10秒/10秒/60秒の段階上限は延長せず、rootによるPromise競合と各await後の経過時間検査を重ねる。
`onReady`やfetchがAbortに協調しなくても待ち続けず、遅延応答・遅い成功を採用しない。

外部Abortは`cancelled`、SIGINT/SIGTERMは`interrupted`、作業期限は`deadline_exceeded`。
最初の停止理由を保持し、cleanup失敗だけは`cleanup_incomplete`を優先する。
専用hostプロセスでの使用を前提にsignal handlerを一時登録し、cleanup中の重複signalも同じ停止経路で処理し、
finallyで自分のhandler/外部購読/タイマーだけを解除する。他のhandlerの削除や親プロセスのexitは行わない。
テスト用の短縮上限は信頼済み内部optionsだけで受け付け、全体385秒/cleanup3秒を超える値や
全体以下でないcleanupはbind前に拒否する。manifestの有効余裕は短縮せず385秒超を要求する。

実workerのterminate・取得枠解放・token/permit参照の破棄・HTTP socket/port解放・SDK closeを待つ。
cleanup待ちは3秒または全体期限までの残り時間の小さい方。待受/資格情報が残る、closeが失敗、または待ちが終わらなければ、
結果を捨て`cleanup=incomplete/code=cleanup_incomplete`を返す。成功票にしない。
起動Promiseはfinallyまで所有し、listenerがまだ変数へ設定されていなくても起動処理の決着を待つ。
起動が成功すれば同じlistenerのcloseと状態を確認し、起動の非同期失敗ならstart内部のcleanup完了まで待つ。
起動待ちとclose待ちは**1つのcleanup期限**を共有し、段階ごとに3秒を取り直さない。
期限内に決着しなければ`cleanup_incomplete`とし、遅れて起動成功した場合もbest-effortのcloseを続けるが、
既に返した終了票を後から`complete`に書き換えない。回帰試験と制限は[検証記録§6](E2E_BEST_PRACTICE_R2_RUNNER_SYNTHETIC_2026-10-18.md#6-bind取消競合の追補検証)を参照。
ライブラリAPI自身はprocess.exit/SIGKILLを呼ばない。終了不能workerが残る場合の専用host強制終了は後続課題で、
イベントループ停止・OS停止・SIGKILL時の385秒厳密保証/完全cleanupを主張しない。

### 14.3 終了票と非出力

終了票は`ok`、`cleanup`（complete/incomplete）、`mcpListed`、`tokenMayHaveBeenIssued`、
`otherAccountTokenPossible`と、成功時の`result`または失敗時の固定`code`だけ。
`ok=true`はMCP応答取得とcleanupの成立を表す。レビューの成功/完全性は内側の`result.isError`と0.2/0.3の
status/limitations等で判断し、partialや0件を安全・適合と読まない。出力をファイル保存/標準出力する処理はない。

connectionは出力検査用に、認可URL/state/code/verifier/Bearer、client ID/期待本人IDをprivate集合に保持する。
SDK結果の直前に、実値とURL符号化/最大2段のJSON escapeの一致を検査し、該当すれば
置換せず`secret_output_detected`だけを返す。集合はconnectionのcleanupで破棄する。
runner・worker・MCPへ検査用の秘密を渡さず、getter/logにも出さない。
これには検査用参照をcleanupまで保持するトレードオフがある。短い値や偶然一致も安全側拒否になり得る。
任意の難読化・分割・すべての符号化への漏えい検出、JS/OSメモリの完全消去は保証しない。
原応答/例外cause/コード本文の非返却と既存JSON契約は引き続き主防御とし、文字列ガードだけに依存しない。

実機/実token・人の承認照合・公開CLI/非同期uncaught例外の最終exit・失効は未実施/未接続。
G2/G4・最小権限・実PDI本人性が成立したとは扱わず、telemetry調査も保留を維持する。
