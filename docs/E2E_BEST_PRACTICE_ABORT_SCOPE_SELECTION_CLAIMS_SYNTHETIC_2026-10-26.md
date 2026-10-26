# BR-006 選択window／行draft・payload開始／移譲claim合成検証（2026-10-26）

## 1. 範囲

既存prepared ownerに選択window／行draft、payload開始・fake完了・移譲claimを追加した。実session class＋fake fetch／source／permit／metadata fixtureで確認する。実source・実ReleasePermit・typed body／cleanup・実payload・worker／jobには接続しない。正式な証拠発行は常に拒否する。

VM／監視／telemetryは保留、Unknown・全体受付無効を維持する。公開14明示／3既定規則・0.2/0.3・認証権限・60秒／210試行等の上限は変更しない。実機操作・トークン発行・設定変更・Pushは行わない。

## 2. 内部契約

- 同owner／session／window／行／開始票を非公開台帳で結合し、凍結opaque handleだけを返す。fake issuerとcoreの両方で既知ownerを検査する。
- window claimはclone／schema検査前に消費する。fixtureの一度だけのclone中にclose／再入した場合も発行を拒否する。
- max_records=1..100、max_records+1以下・最大101行、所属／昇順／重複なし／strict schemaを検査。lookaheadには行draftを作らない。
- fake recipeはAU-BR-006単独。bounded_all省略互換、review_targetsの固定filter version／BR候補条件を検査。実sourceのselection policy証明ではない。
- 行lookupは繰返し可能だがpayload開始は一度だけ。fake完了票と移譲claimの発行／消費も一度だけ。unavailableからの修正・別行混入を禁止する。
- fake完了には本文・hash・cleanup・実jobを持たせず、移譲消費はsimulated／synthetic／disabledの固定summaryだけを返す。
- owner失効でprivate snapshot／session参照と行data／start参照を外す。失効後は全操作を元の停止理由で拒否し、claimを戻さない。他ownerの票を誤って消費しない。

通常phaseの実取得admission・phase世代permitは未実装。fake claimを実GETやpostMessageの許可として使わない。参照除去はGCや物理メモリ消去の証明ではない。

## 3. 新規合成試験

54件：正常状態遷移、正式発行拒否、HTTP／byte追加ゼロ、凍結／非列挙handle、readonly lookupと二重開始、window一度限り、空window、全mode／省略、lookahead、100選択＋1行境界、不正件数／上限／未対応ruleset／extra／proxy、所属／重複／逆順、filter version／候補条件（lookahead含む）、非対象資産、不変snapshot、clone中close／再入、他session／他owner／cloneの各handle、二重settle／失敗後再開始／ready未成立、二重移譲／消費、同window別行混入、close／取消／hard期限後の全拒否、他fake issuer、不正outcome／raw移譲票の非反射を確認する。

100行のclaim chainでもfake認証確認時のHTTP1回とbyte／payload statsが増えないことを独立したfetch呼出し数・前後stats比較で確認する。新しい実会計上界や実配送成功を主張する試験ではない。

## 4. 実行結果

- 初回の新規51件＋既存owner31件は成功。空window／再入／hard期限3件を追加し、新規54件を含む関連20ファイル・811テストが成功した。
- 最終npm run build成功。変更したruntime core／fake issuer／新規testのESLint成功。
- 実tarballの373ファイルにruntime lifecycleあり、dist/review/abort-scope-evidence*は0件。fake issuerは非同梱を維持した。
- 一時展開したtarballからbounded-readとlifecycleを既存node_modulesでimportできた。session生成・ネットワーク開始なし。production-only npm ci／package-worker.mjs全体を実行した検証ではない。
- 一時cacheはprocess限定の指定で、npm設定ファイルは変更していない。全リポジトリ試験・実機試験は未実施。
- 更新2文書の相対リンク5件・末尾空白確認に問題なし。git diff --check成功。

## 5. 残課題

実sourceのwindow／行受領物、mixed ruleset／選択policy identity、実payloadの所属／版／同byte課金、typed body／cleanup、通常phase admission、実worker jobへの一度限りの移譲、final seal／上位診断。正式な証拠発行口は閉じたままとする。

runtime coreは従来どおり同梱対象。fake issuerは既存dist/review/abort-scope-evidence*の除外を維持する。新しい依存パッケージは追加していない。
