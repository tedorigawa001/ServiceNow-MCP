# BP-5：C方式の運用者設定フォールバック

Date: 2026-10-17 / Stage: operator-fallback-0.1。
内部サーバー設定からの判定と合成テストを実装。後続の[設定ファイル/CLI記録](BEST_PRACTICE_BP5_OPERATOR_SETUP.md)で安全なファイル読込を接続。MCP登録・実機操作・利用者の実設定の変更は行わない。

## 1. 信頼境界と設定の受け口

`ServiceNowConfig.reviewReleaseConfig`を信頼されたサーバー側の構成として受け取り、
`createBoundedReadSession()`の開始時、await前に検証して新しいオブジェクトへ固定する。
MCP入力、HTTPヘッダー、会話、payload、`resolveRelease()`の引数、取得optionsからは受け付けない。
通常のclient取得経路には影響させず、構造不正はboundedレビュー開始時に固定エラー`config_invalid`で拒否する。

構造は全階層で追加キーを拒否する。

```ts
const reviewReleaseConfig = {
  instance_id: 'dev',
  assertion: {
    family: 'Australia',
    instance_binding: createReviewInstanceBinding('dev', 'https://example.service-now.com'),
    asserted_at: '2026-10-17T00:00:00Z',
    expires_at: '2026-10-18T00:00:00Z',
    evidence_reference: 'private-upgrade-record', // 任意。結果に本文を返さない
  },
};
// new ServiceNowClient({ ...serverOwnedConnectionConfig, reviewReleaseConfig })
```

これはプログラム上の設定例。instances.jsonでのキー名・信頼検査・binding CLIは後続記録を参照。
assertion省略は実測のみ。reviewReleaseConfig自体を省略した場合の設定IDは`default`。
null、未知family、必須列の欠落、余分なキー、不正日時/ハッシュを黙って無視しない。
familyは既存契約と同じ正規形（Australia/Brazil/Zurich/Yokohama/Xanadu）で指定する。

ファイルの所有者・書込権限・親ディレクトリ・symlink・再読込の検証は後続で実装し、InstanceManagerの手動/ウィザード両形式の読込へ接続した。ウィザードのassertion自動作成は行わない。
本機能はサーバーが渡した設定を信頼する内部APIであり、設定者の承認や元の運用情報の真実性を立証しない。

## 2. bindingと版の定義

`createReviewInstanceBinding(instance_id, instanceUrl)`は次のJSON配列のUTF-8 SHA-256を小文字hexで返す。

```text
["servicenow-mcp:bp5-binding:v1", instance_id, canonical_https_origin]
```

instance_idは小文字英字で始まる1〜64文字の英小文字/数字/`_`/`-`。
URLはHTTPS、ルートパスのみ。userinfo・query・fragmentを拒否する。
URL.originによるホスト名小文字化・既定ポート除去・末尾スラッシュの同一視を行う。
同じ接続先でも設定IDが違えばbindingは変わり、同じIDでも接続先が変われば失効する。
生URL、トークン、利用者名、secretは結果のbindingへ埋め込まない。

設定と固定した接続先からbindingを再計算し、assertion.instance_bindingと照合する。
不一致はnone/unknown・config_binding_mismatchとし、実測で黙って救済せずpermitを発行しない。
この保守的な場合はリリース表の照会もせず、親取得後に停止する。

config_versionは、検証後の設定全体をスキーマのキー順でJSON化してSHA-256した識別子。
運用者が任意の版を自己申告する欄は設けない。期限・family・私有参照等の変更で版も変わる。
evidence_referenceはそのハッシュにだけ寄与し、本文は証拠/エラー/ログへ出さない。
ハッシュ/IDも識別情報であり匿名性を保証しない。

## 3. 時刻の扱い

- asserted_at ≤ started_atを要求。未来の申告やexpires_at ≤ asserted_atはconfig_invalid。
- expires_at ≤ started_atはconfig_expired。
- started_at < expires_at ≤ started_at + deadline_msはconfig_validity_insufficient。
- フォールバックで採用するにはexpires_at > started_at + deadline_ms。製品既定では60秒ちょうども不足。

開始時刻を固定して評価し、リリース照会後や集約終了時に期限を再採用/延長しない。
同一familyの正当な実測が得られた場合は期限切れ/余裕不足の設定を根拠にせず、警告を残して実測を利用できる。
最大有効期間・再確認周期の運用者承認は未決定であり、自動更新や期限なしの採用は実装しない。

## 4. C方式の判定とpermit

| 実測 | 設定 | 結果 |
|---|---|---|
| 既知の単一family、20行以内 | 未設定/同じfamily | 実測resolvedを採用。期限切れ等はlimitationsに残す |
| 既知の単一family | 別family（期限切れも含む） | conflict/unknown。configured_familyとobserved_familiesを最小限記録。permitなし |
| 混在・一部欠落・未知形式・不正構造・21行目 | 任意 | unknown。設定で覆わない |
| 403/404、正常0行、全行空/値なし、当該照会の再試行後のtimeout/5xx等 | binding一致・期限内/十分な余裕あり | operator_config/assertedとしてカタログ照合 |
| 同上 | 未設定/期限切れ/余裕不足 | none/unknownと具体的理由。permitなし |
| 401・親の拒否・全体期限/受信量/試行予算の失敗 | 任意 | 既存の停止エラーを維持。設定で回避しない |

matchedの場合だけ、既存のsource固有インメモリpermitを同じ発行経路で作る。
設定が有効でもfamilyが非対応ならmismatchedでpermitなし。
assertedのmatchedは設定とカタログの一致であり、実測・実行経路・実機確認済みという意味ではない。
以下のlimitationsを必須として返す。

`release_operator_asserted` / `release_not_observed` / `release_config_may_be_stale` / `release_observation_unavailable`。

1件/集約アダプターはこの証拠と制限を保持し、partial・candidate/low/infoを維持する既存契約を通す必要がある。
既存bp-review-0.1を偽装利用せず、bp-review-0.2へそのまま渡せることを合成テストで確認する。

## 5. 合成検証と未実装

tests/review/operator-release-fallback.test.tsで、bindingの正規化/接続先・ID差、設定期限の境界、構造不正、実測優先、期限切れを含む競合、欠落/混在/上限、HTTP失敗、設定コピー固定、版・私有参照非返却、呼出し入力/optionsからの注入拒否を検証する。
null行の不正構造は「全行値なし」と区別し、フォールバックを認めない。

1件解析/集約は[アダプター記録](BEST_PRACTICE_BP5_ADAPTERS.md)のとおり後続で接続済み。
未実装：同期解析worker、MCP登録/梱包、実機E2Eと公開/品質承認。
本記録の合成テストは設定の真正性や本番利用可能性を証明しない。

検証記録（2026-10-17）：

- TDD：新規モジュール未実装の失敗→実装→成功を確認。不正なnull行が設定フォールバックされる再現テストも、失敗確認後に拒否へ修正。
- 新規35件成功。既存の実測ゲート16件・bounded取得34件と合わせて85件成功。
- `npm test`：87ファイル・2,264件成功。旧契約・固定評価の再評価を含む。
- `npm run build`、`npm run type-check`：成功。
- 判定・transport・設定モジュールと新規テストの4ファイルのESLint（--max-warnings 0）：エラー/警告0。
- `npm run lint`：エラー0、既存警告374件。無関係箇所は変更しない。
- 既存の契約/JSON Schema/例と固定評価関連21ファイルをHEADとバイト比較し、変更なし。
- `git diff --check`と新規ファイルの末尾空白検査：成功。

合成設定と注入fetchのみを使用し、MCP登録・実機照会/書込み・設定ファイルの読込/変更は行っていない。
