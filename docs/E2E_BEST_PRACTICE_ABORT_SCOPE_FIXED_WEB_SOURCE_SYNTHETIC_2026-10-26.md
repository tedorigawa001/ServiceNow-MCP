# AU-BR-006 固定source／取得証拠の結合：合成検証

Date: 2026-10-26。対象：[固定source設計§13](BEST_PRACTICE_ABORT_SCOPE_FIXED_SOURCE_ISSUER_DESIGN.md#13-固定sourceとweb-streams受領物の結合fixture限定)。

## 1. 範囲

分離済みFixtureAccountingSession／fixture ownerに、固定GET descriptorと注入ResponseのWeb Streams受領物を結合した。実session／実認証／実ReleasePermit／実選択payload／worker planを受理・発行しない。global fetchを呼ばず、PDIの読取・書込・設定変更・トークン発行は対象外。VM／監視／telemetry保留、Unknown・全体受付無効、本番cap・正式証拠発行口の閉鎖を維持する。

## 2. 変更

- 新しい開発専用compositionがprepare→table初回→親／metadata／table最終を固定順に処理する。固定path・query・fields・limit・offset・表示値／参照リンクflagを内部生成し、callerの任意要求を受けない。
- receiptに捕捉statusと同予算の終端経過時刻を保持。同用途票・phase・未消費bodyだけを一度消費し、必要列だけを投影する。raw JSON／本文／余分な列／任意projectorを返さない。
- tableの純粋normalizerを既存合成issuerと共通化。name矛盾は停止、0/2件・列不足・不正scopeはunavailable、scope nullはUnknownとして区別する。
- 意味検査による初回unavailableだけ、同receipt消費から会計ownerを一方向にdowngrade。final GETなしのskipでRだけを返し、C/G/Eは返金しない。同名cacheも追加取得／課金なし。
- 同じownerの時計／期限／retry／C/G/E/Rを維持。投影後／集約後のcheckpoint、失効後cache拒否、cleanup未確認の停止を接続した。
- 最終statusはstable／changed／unverified。固定理由と`synthetic:true`／`evidence_issuance:disabled`／`seal:null`を返す。stableでも正式証拠やレビューcompletionを発行しない。

## 3. 合成テスト（新規28ケース）

`tests/review/abort-scope-evidence-fixed-web-source.test.ts`。

| 観点 | 確認 |
|---|---|
| 固定要求／順序 | 親→metadata→table初回→親→metadata→table最終。固定fields／query／limit等を確認 |
| cache／会計 | 同名2回目は追加GETなし。独立したイベントのUTF-8 byte合計／試行数と実C/Gを照合。投影／比較で二重課金なし |
| 正規化／局所継続 | 0件・2件・列不足・不正scope、404、503 retry枯渇で理由保持。final GETなし、R=0へ解放 |
| 全体停止 | 401／403、別name混入、失効後cache、終了後owner再生成、cleanup未確認、active closeを拒否 |
| 一度限りの消費 | receiptコピー／二重消費／payload用途でのsource投影を拒否。201が200へ置換されないことを確認 |
| 非露出 | JSON外側／行内に架空の秘密とpayload／script列を混ぜ、投影・summaryへ出ないことを確認 |
| 時点／版 | callerの時刻を受けず同予算の経過時刻を使用。table最終版変更、parent版変更、scope nullを別状態として保持 |
| metadata結合 | 別Update Set・重複／逆順・101件lookahead・必須版列欠落を不完全として保持。正常行の版変更と余分なpayload列の非保持を確認 |
| 最終retry境界 | table8件の初回／最終でE=262,144byte。最後の503でEが閉鎖し、retryなし・残り1予約だけ解放。21試行／R=0を確認 |

経過7msの合成観測は`1970-01-01T00:00:00.007Z`となる。これはelapsed-clockをISOにしたfixture表現であり、実測wall-clock日時ではない。資格情報・実コード本文は試験へ投入していない。

## 4. 検証コマンドと結果

- `bdo npm run build`：成功。
- `bdo proxy node node_modules/vitest/vitest.mjs run tests/review/abort-scope-evidence-fixed-web-source.test.ts`：28/28成功。
- `bdo npm test`：最終再実行で153ファイル／4,494件成功。PDI E2Eは含まない。
- ESLint APIでsrc／tests全体：0 errors、既存374 warnings。今回変更ファイルの個別確認は0 errors／0 warnings。
- `bdo proxy env npm_config_cache=/private/tmp/servicenow-mcp-owner-pack-cache npm_config_offline=true node tests/review/package-worker.mjs`：377梱包ファイル、production-only install／worker解析・集約／MCP／fixture権限分離のsmoke成功。`dist/review/abort-scope-evidence*`全体が非同梱であることを既存assertionで確認。
- `bdo git -c core.fsmonitor=false diff --check`：空白エラーなし。

## 5. 制限と次工程

注入関数は試験側がResponseを供給するTCBで、ネットワークの由来を証明しない。table名も合成入力であり実worker計画ではない。親／metadataの部分実装はall-metadata最大100件で、既存0.3 review_targets選択への結合ではない。

実認証snapshot／source／ReleasePermit／selection・payload・worker jobへの接続、本番用非共有claim台帳、正式wall-clock、seal／上位診断、cap承認・実HTTP cleanup・全体work上界が残る。旧合成sealやraw frameを新取得証拠へ昇格させない。実機操作・設定変更・本番cap投入・正式発行・Pushは本検証に含めない。
