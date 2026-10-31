# AU-BR-006 ST-03C：注入Responseからprivate発行・一度限り消費への連続合成検証

Date: 2026-10-31 / Scope: 注入Response／Streams・fake clock／scheduler。実session／実通信／PDI E2Eではない。

## 1 実装範囲

[接続設計§12](BEST_PRACTICE_ABORT_SCOPE_STATUS_TERMINAL_CONNECTION_DESIGN.md)に従い、ST-02のprivate constructor内へ固定issuer／consumerを接続した。同context／anchor・native header／同reader cleanup・元window／clockを保持し、外部診断をST-03Bの合成issuerへ再入力しない。ST-03A／Bは回帰参照モデルとして維持し、native recordとのmutable受渡し口はexportしない。

既存createInjectedStatusCleanupOwnerは診断専用を維持。追加createInjectedStatusWorkflowOwnerだけがstrictなfake I/O依存を受け、同Recordのcleanup後にprivate発行・一度限り消費を行う。constructorの未知key／accessor／proxy、record／consumer／session等の注入は最初の取得をI/O前に拒否する。返すのは診断と全7権限=falseの限定消費履歴だけで、token／consumer／recordは返さない。

## 2 実行結果

| 確認 | 結果 |
|---|---|
| `bdo npm run build` | 成功 |
| 関連10ファイルのVitest（下記、初期47件の時点） | 3,434件成功 |
| `bdo npm test`（legacy所有権拒否2件追加後） | 全体合成202ファイル・9,203件成功。新規status-workflowは49件 |
| `bdo npx eslint src/review/abort-scope-evidence-status-cleanup.ts tests/review/status-workflow.test.ts` | 指摘なし |
| `bdo node tests/review/package-http-classification.mjs` | 409ファイルdry-run成功。開発専用module／fixture非同梱、packaged runtimeの依存なし |
| compiled連続fixture | fetch／readを禁止し、同readerのclosed→cancel→release、private発行／消費1回、no_body、二重finish拒否、raw診断注入拒否を確認 |

関連10ファイルは`tests/review/status-workflow.test.ts`、`status-cleanup.test.ts`、`status-consumer.test.ts`、`status-context.test.ts`、`status-terminal.test.ts`、`http-classification.test.ts`、`http-classification-legacy.test.ts`、`native-reader-adapter.test.ts`、`native-body-bootstrap.test.ts`、`native-ownership-contract.test.ts`（全てtests/review配下）。

## 3 確認した境界

- 製品の適格性helperを使わないpurpose×status×bodyの手書き11行表を照合し、件数・一意性を確認した。release403／404だけが消費、hard／local失敗は診断専用。no_bodyは全操作0でEOFにしない。
- 同reader identityをnative操作の外側から観測し、closed取得→cancel→release→issue clock→pre clock→post clockの順序を照合した。read=0、他の各操作1回で、同resourceの二度目取得や本文解析はない。
- issue／pre／postの取消・再入・元floor等号到達・clock throw、cleanup後の元上限以内の逆行を拒否。消費失敗でもconfirmed cleanupやHTTPを変更しない。元clock／last値は再初期化しない。
- pending cancelの期限後解放・late settleで診断を格上げしない。stop／close／finishは同cleanupへ合流し、hard HTTP primaryと独立した取消理由を保持する。
- getReader／closed取得／releaseの失敗、cancel rejectで発行しない。foreign／copy handleは拒否し、foreign reader／診断を変更しない。
- 成功後の二重finish／stop／closeでもfirst_terminal=consumedと成功履歴は過去の事実として保持し、発行／消費件数は1以下。tokenを再提出するAPI自体がない。
- ST-02既存entryで取得／解放したResponse・handle・診断から新workflowを再開できない。bodyなしの未disturbed Responseも所有claimで拒否する。
- constructorにrecord／consumer／callback／registry／context／sessionを追加するとI/O前に拒否する。固定済みbudget read・deadlineを外から置換しても別観測元へ移らない。本文／例外の秘密markerは出力しない。

## 4 初回ビルドの失敗

初回tscは、private tokenの可変ローカル変数がobjectまたはundefinedの型として残り、WeakMap.setに渡せないTS2345で停止した。該当箇所を照合し、生成直後のtokenを明示的なobject型のconstに保持してから登録する形に修正した。型チェックの緩和・anyへの置換・guard削除は行わず、再ビルド成功を確認した。

既存ST-02／ST-03A／Bの174件、新規47件はいずれも成功し、その後legacy所有権2件を含む全体202ファイル・9,203件を確認した。製品・テストの期限は緩和していない。

## 5 未確認・未接続

実session／認証snapshot／source／ReleasePermit／canonical C/G/P/R予算への正式binding、実dispatch・retry／fallback・公開終了codeへの採用は未接続。constructorが持つlocal世代／readonly budgetは注入試験内の同一性であり、実runの証拠ではない。read=0はreader呼出しの意味で、socket受信やprefetchが0だったとは主張しない。

任意の同期callbackのOSレベル強制中断や実transportの後始末を確認した記録ではない。STC-T01〜T20全体やruntime承認の完了に読み替えず、正式発行口閉鎖・Unknown・全体受付無効・VM／監視／telemetry調査保留を維持する。実session接続・実通信・実機操作・設定変更は行っていない。
