# BP-5：bounded取得・認証固定の実装記録

Date: 2026-10-17 / Stage: acquisition-primitives-0.1。
MCP未登録。実機操作・設定変更・公開は行わない。ローカルの合成HTTP/ストリームと仮想時計で検証する。

## 実装した入口と境界

- `ServiceNowClient.createBoundedReadSession()`：選択済みclientから接続先、認証モード、ユーザートークン、OAuth設定、キャッシュトークン/期限を、await前にコピーする。
- `withBoundedUpdateSetSource(client, input, callback, options?)`：入力を検証し、1回の取得セッションを開始する。正常終了・例外・キャンセル時に必ずcloseする。閉じたsourceから再取得できない。
- `BoundedUpdateSetSource`：readParent → resolveRelease → matched時のpermitを使うlistMetadata → 選択行のreadPayload → verifyの**内部プリミティブ**。C方式の実測/内部設定フォールバックは実装済み。実ファイル設定と解析を行う完成したレビュー処理ではない。

`input`はupdate_set_sys_idとmax_records（既定20、1〜100）のみ。URL、query、fields、release、actor、資格情報を受け付けない。
optionsのfetch/signal/小さいテスト用上限は信頼された内部依存注入専用で、MCP入力には公開しない。
上限は小さくできるが、製品上限を引き上げられない。

## 認証固定

接続先は開始時のHTTPS originに固定する。userinfo、パス、query、fragmentを含む接続先は拒否し、redirectもerror指定で追跡しない。
以後InstanceContext/環境変数/設定を再参照せず、利用者切替・再読込が起きても同じsnapshotを使う。
per-userはbound bearer必須。不足時にservice-accountへ切り替えない。
service-accountは固定済み設定でclient_credentialsまたはpassword grantを行う。
十分な残存期限のあるキャッシュトークンだけを利用し、そうでなければ同じ設定からOAuthを取得する。新トークンも全体予算を超える有効期間が必要。
401後のトークン更新/別主体への再試行は禁止。現BP-5契約にないimpersonationは、黙ってサービスアカウント権限で動かさず開始時に拒否する。

認証用HTTPも同じ時間・受信量・試行回数に加算する。既存clientのauthenticate/request/retry/loggerは使わない。
同じ接続先・認証キーは同時1件、プロセス全体2件。解放はcallbackのfinallyで行う。
認証キーは内部ハッシュであり結果に返さない。これは実効利用者IDの同定ではない。
per-userはbearerトークン由来なので、同じ利用者でもトークンが更新/再発行されると別キーになる。
service-accountも設定が別なら、実際に同一ユーザーへ解決されるかまでは証明できない。
従って「人間利用者ごとに厳密に1件」を保証せず、プロセス全体2件の上限は両モードで維持する。
安定した利用者IDやセッションIDによる枠管理は、既存ACLを保つ認可設計と合わせて後続で検討する。

## 実際に適用する上限・停止

| 対象 | 上限/扱い |
|---|---|
| HTTP本文 | fetchが返す本文ストリームをバイト計測。1応答4MiB、累計16MiB。Content-Lengthを信用しない |
| エラー本文 | 429/5xxは同じ予算で読み捨て、再試行分も加算。401/403/404等の確定失敗は本文を読まず即キャンセルし、エラー本文の停滞を再試行の理由にしない |
| payload | UTF-8 1件2MiB、試行累計8MiB。他の列が欠落/変更され拒否しても、取得済み文字列を累計に残す |
| metadata | max_records+1、最大101行。サーバーがlimitを無視して増やしたら拒否。選択先頭100行以内だけ詳細取得可能。対象外/削除も行予算に含む |
| release行 | fields=build_name、21行まで。実測はsource内で照合し、余分なアドレス/証明書は判定結果へ転送しない。C方式の設定経路は後続 |
| HTTP試行 | 210回。通常取得は最終親+一覧照合の最大4試行（各最大2回）を残す |
| 時間 | セッション全体60秒、各HTTPは残り時間以下かつ最大10秒。再試行最大1回、待機250msも全体期限内 |
| 同時処理 | 1セッション内HTTPは同時1件。sourceの選択詳細は各IDにつき1回、最終照合も1回 |

ストリーム超過でAbortControllerとreader.cancelを使い、超過本文を読み切ったり保持したりしない。
HTTP/readerがsignalを無視する合成ケースでもPromise.raceで待機を終了し、後から届く応答のbodyもキャンセルする。
本物のネットワーク/OSが切断済みかを合成テストで証明するものではない。
受信チャンクは届いた単位で計測するため、超過を検出した最後のチャンク分だけカウンターが上限を超えることはあるが、蓄積配列には追加しない。
外部AbortSignalも受け付け、理由の原文を返さずcancelledとする。終了時はタイマー・イベントリスナー・同時実行枠を解放する。

受信/全体payload/認証/全体権限/全体期限の失敗は以後の取得も停止する。
単一payload超過、不可視、不正レコードは当該取得の固定理由で拒否する。
sys_cluster_stateの403だけはセッション全体を停止せず、C方式の有効な内部設定があればフォールバックを判定する。設定なし/不正ならpermitなしでmetadata/payloadを取得できない。
他の段階の403と全段階の401は停止する。原HTTP例外・URL・本文・資格情報をエラーメッセージ/cause/logへ転送しない。

## 整合性照合

親のID、metadataの必須列/所属/重複/昇順を検証する。
詳細はsys_idと親Update SetのAND固定条件で取得し、ID/所属/name/action/更新時刻/版を一覧と比較する。
食い違いはchanged_during_reviewとして解析へ渡さない。
最終verifyは親とmetadata（検知用+1行も含む）を再取得し、stable_observation/changedを返す。
取得失敗は例外でありstableに変換しない。予約した試行以外に、時間・受信量が残る保証はない。予算切れの最終照合は後続集約でunverifiedにする。
安定観測はDBトランザクションのsnapshot保証や、不可視データがないことの証明ではない。

## source内のリリースゲート

`resolveRelease()`にfamily/evidence/matchedを渡す引数はない。親取得後、このsourceの固定認証・予算でbuild_nameを1回だけ取得してカタログと照合する。内部設定フォールバックの採用/拒否も同じsource内で行う（[C方式記録](BEST_PRACTICE_BP5_OPERATOR_FALLBACK.md)）。
全可視値が単一の既知familyで一致した場合だけ実測resolvedとなり、カタログ一致時にだけ`ReleasePermit`を発行する。
大文字小文字と前後空白は正規化する。非対応familyはmismatched、空/全欠落はobservation_unavailable、部分欠落/不正構造はobservation_incomplete、未知名はobservation_inconsistent、21行目はobservation_limitとする。
既知familyの混在はconflict/unknown。401・受信量/期限等の致命的失敗は通常どおり停止し、403/404/取得不能はunknownとする。
いずれもmatchedでなければpermitなし。呼出し側はその結果から全要求規則のrelease_unknown/release_mismatchスキップを構成する必要がある。

`listMetadata(permit)`、`readPayload(sys_id, permit)`、`verify(permit)`はいずれも同じsourceが発行したオブジェクトの同一性を検査する。
permitはsourceの非公開フィールドに保持するインメモリの能力トークンで、認証用bearerとは別物。文字列/JSON契約/MCP入力にはしない。
形の偽装、コピー、別source・閉じたsourceのトークンは拒否する。判定済み結果を再取得してもネットワーク照会/トークン発行を繰り返さない。
取得済みmetadataがあっても各payloadと最終照合で再度permitとセッションの生存を確認する。
これは信頼されたプロセス内のアダプターの判定漏れを防ぐ境界であり、任意のJavaScriptを同一プロセスで実行できる攻撃者に対するsandboxではない。

## 未実装・次段階

- 設定ファイルの読込/所有者・書込権限検査とbinding CLIは[後続記録](BEST_PRACTICE_BP5_OPERATOR_SETUP.md)で実装済み。Windows ACLの検証は未対応で拒否する。呼出し側が任意のasserted証拠を渡して解除する入口は追加しない。
- 1件解析/集約、固定理由の写像、partial/failedの組立ては[アダプター記録](BEST_PRACTICE_BP5_ADAPTERS.md)のとおり後続で実装済み。
- 同期XML/AST解析を強制終了するworker境界。現在の全体タイマーはイベントループ上の非同期取得/待機を中断し、同期処理が戻った後にも期限超過を検出するが、同期CPU処理そのものを途中で止められない。
- MCP登録/dispatch/annotations、公開範囲の承認、梱包・読み取り実機E2E。

sourceは内部でpayloadを扱うため、callbackの戻り値をそのままMCP結果として公開してはいけない。本文非返却の集約契約を構築・検証するアダプターを経由する（上記記録参照）。
既存bp-review-0.1、固定評価セット、MCPツール一覧、通常clientの既存取得経路は変更しない。

## 合成検証

tests/review/bounded-source.test.ts：固定fields/接続先/認証、OAuth snapshot、401非再認証、403の段階差、実測ストリーム超過/累計、停滞fetch/body、遅延応答キャンセル、全体/各HTTP期限、再試行、外部キャンセル、枠解放、最終照合予約、100+1行、重複/所属/必須列/順序、UTF-8 payload累計と変更検知を検証する。
実機・外部HTTPは呼び出さない。テストのfetchは注入した合成Response/ReadableStreamのみ。

検証結果（2026-10-17）：

- 新規34件成功。初回の未実装失敗から実装し、検知用+1行の変更見逃し、拒否payloadの未加算、期限超過後の遅い成功、401本文停滞の誤再試行はテスト失敗→実装修正→成功を確認。
- `npm test`：85ファイル・2,213件成功。旧契約と固定セットの再評価も含む。
- `npm run build`、`npm run type-check`：成功。
- 新規TypeScript 3ファイルのESLint（--max-warnings 0）：エラー/警告0。
- `npm run lint`：エラー0、既存警告374件。無関係箇所を修正しない。
- `git diff --check`と新規ファイルの末尾空白検査：成功。
- 既存の版付き契約/JSON Schema/例と固定評価関連21ファイルをHEADとバイト比較し、変更なし。

この検証は取得境界の機能検証であり、実機疎通・独立人手評価・検出精度・解析workerの中断を主張しない。

### リリースゲート追補（2026-10-17）

旧版の「統合前に必須」としていたリリース判定を取得側へ移動した。ゲートなしでmetadataを取得できる再現テストを先に失敗させ、permit必須化で成功を確認。
tests/review/release-gate.test.tsで未判定/不一致/不明、混在/欠落/過剰行、HTTP失敗、偽装・コピー・別source・close後のpermit、判定照会の一回性を検証する。
既存取得テストも実際のsource.resolveReleaseを通す合成HTTPへ移行し、追加1照会を試行予算に加算して確認する。固定評価ケースは変更しない。

追補の再検証：新規16件＋既存取得34件成功、全体は86ファイル・2,229件成功。`npm run build`成功、変更TypeScript 4ファイルのESLint（--max-warnings 0）成功。
同時実行枠の主体についても、per-userのトークン更新時は別キーになる制約を明記し、実効利用者IDによる制限とは区別した。MCP登録・実機照会・設定変更は行っていない。
