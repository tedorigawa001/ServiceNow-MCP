# BP-5：bounded取得・認証固定の実装記録

Date: 2026-10-17 / Stage: acquisition-primitives-0.1。
MCP未登録。実機操作・設定変更・公開は行わない。ローカルの合成HTTP/ストリームと仮想時計で検証する。

## 実装した入口と境界

- `ServiceNowClient.createBoundedReadSession()`：選択済みclientから接続先、認証モード、ユーザートークン、OAuth設定、キャッシュトークン/期限を、await前にコピーする。
- `withBoundedUpdateSetSource(client, input, callback, options?)`：入力を検証し、1回の取得セッションを開始する。正常終了・例外・キャンセル時に必ずcloseする。閉じたsourceから再取得できない。
- `BoundedUpdateSetSource`：readParent → readReleaseRows（必要時）→ listMetadata → 選択行のreadPayload → verifyの**内部プリミティブ**。リリース解決と解析を行う完成したレビュー処理ではない。

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
同じ接続先・認証主体は同時1件、プロセス全体2件。解放はcallbackのfinallyで行う。
主体キーは内部ハッシュであり結果に返さない。service-accountの設定が別でも、実際に同一ユーザーへ解決されるかまでは証明できないため、実効主体同定は後続の認可設計でも確認が必要。

## 実際に適用する上限・停止

| 対象 | 上限/扱い |
|---|---|
| HTTP本文 | fetchが返す本文ストリームをバイト計測。1応答4MiB、累計16MiB。Content-Lengthを信用しない |
| エラー本文 | 429/5xxは同じ予算で読み捨て、再試行分も加算。401/403/404等の確定失敗は本文を読まず即キャンセルし、エラー本文の停滞を再試行の理由にしない |
| payload | UTF-8 1件2MiB、試行累計8MiB。他の列が欠落/変更され拒否しても、取得済み文字列を累計に残す |
| metadata | max_records+1、最大101行。サーバーがlimitを無視して増やしたら拒否。選択先頭100行以内だけ詳細取得可能。対象外/削除も行予算に含む |
| release行 | fields=build_name、21行まで。余分なアドレス/証明書は内部転送しない。C方式への解決は後続 |
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
sys_cluster_stateの403だけは、後でC方式の設定経路を判定できるようセッション全体を停止しない。
他の段階の403と全段階の401は停止する。原HTTP例外・URL・本文・資格情報をエラーメッセージ/cause/logへ転送しない。

## 整合性照合

親のID、metadataの必須列/所属/重複/昇順を検証する。
詳細はsys_idと親Update SetのAND固定条件で取得し、ID/所属/name/action/更新時刻/版を一覧と比較する。
食い違いはchanged_during_reviewとして解析へ渡さない。
最終verifyは親とmetadata（検知用+1行も含む）を再取得し、stable_observation/changedを返す。
取得失敗は例外でありstableに変換しない。予約した試行以外に、時間・受信量が残る保証はない。予算切れの最終照合は後続集約でunverifiedにする。
安定観測はDBトランザクションのsnapshot保証や、不可視データがないことの証明ではない。

## 未実装・次段階

- C方式のリリース解決器、信頼された設定の読み取り、binding生成、設定の期限余裕を判定する開始ゲート。今回のsourceを直接呼ぶだけでは、リリース不明時のmetadata/payload取得停止は強制されない。統合前に必須。
- 1件解析アダプターと集約、固定理由から集約契約への写像、partial/failedの組立て。
- 同期XML/AST解析を強制終了するworker境界。現在の全体タイマーはイベントループ上の非同期取得/待機を中断し、同期処理が戻った後にも期限超過を検出するが、同期CPU処理そのものを途中で止められない。
- MCP登録/dispatch/annotations、公開範囲の承認、梱包・読み取り実機E2E。

sourceは内部でpayloadを扱うため、callbackの戻り値をそのままMCP結果として公開してはいけない。後続アダプターで本文非返却の集約契約を構築・検証する。
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
