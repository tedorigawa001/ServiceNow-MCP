# FP-2：同snapshot expectation・BundlePartsDraft・全構成照合

Date: 2026-11-04。実装開始時HEAD: `b163992`。[接続差分設計](BEST_PRACTICE_ABORT_SCOPE_RECOVERY_FULL_PROJECTION_BUNDLE_DESIGN.md)のFP-2だけを合成依存限定で接続した。

## 1 実装・所有権と停止範囲

新しいpackage-excludedのfresh入口`createSyntheticBundlePartsRoot`はprivate constructor継続でfull受領＋parts準備を固定し、公開面には引数なし`prepareBundleParts`を返す。元take／header-full共通claim・root側transfer開始claimを再利用し、full受領後に二度目の取得をしない。callerによるmode指定・既存ownerの登録・snapshot getterはない。

private channelの比較専用reprojectは、同受領物・同live plan／source／ready／cleanupを先に検査する。既存`compareSyntheticFinishValues`で再投影と**元受領snapshot**の全DATA／opaque identityを照合し、再投影を新しいaccepted originにしない。小型expectationは元snapshotのheader／selected／inputs／outcomes／context／S・O・U・全deadlineと元accepted handleからだけ作り、wire等はunknown／unverifiedのままとする。

`BundlePartsDraft`は非exportのwork候補。先行確保した同dest owner、同pending／受領物、元model／row-links、同snapshotのexpectation、同headerのprefix候補、D1の全本文draft、同budget identity／serial・失効serialを保持する。D1 original_rows／manifestとrow／一般row receipt・input receipt／accepted outcomeの結合は別々に照合する。pure helperのDATAをreceiptやContentCheckedへ昇格しない。

work内で全構成を検査し、静的不適合は暫定保持してpostの取消／期限／先行hardを優先する。post guard後に元受領物と全構成を再検査する。expectationのbinding／frame／receiptは参照同一性、metadata／時刻／集合・小型契約とfull本文／traceは全field値比較を行う。P0・Pp・base・ordered／canonicalのlaneを混同せず、prefix候補の元純粋計算結果参照とPp／base／canonicalの対応も保持する。

post通過後も固定abortだけに進み、ContentChecked・prefix関係値・完成bundle・成功dest／sealは生成しない。破棄ではexpectation／parts／候補／owner／full受領物を全clearし、payloadPending／isClearedに含める。保護scope終了後の本文破棄確認を通ってから、既存cleanup-only capsuleと固定診断だけを上位custodyへ移す。正常なparts照合とcleanup確認は別であり、未確認責務はUnknownのまま保持する。

FP-1・旧header／D2継続は維持する。FP-1では新しいexpectation／D1／parts生成を呼ばない。

## 2 費目・検証条件

- full再投影／bounded比較、expectationのbounded収集／copy、D1 full-body検査／copy、prefix計算、row／receiptの照合、work／post全構成比較、同時保持参照とclearを追加費目として区別する。同receipt／budget・開始UTC／全deadlineは不変で、C/G/P・retry・210試行・全60秒および既存局所上限を増やさない。
- 複数の値比較・再parseは無料とは扱わない。全work／heap・copyピーク・3round配賦・予約額は未導出Unknownで、local countersやhelper usageを全体受付の証拠にしない。
- Vitestではreviewedゼロとmixed（reviewed・親省略・元worker省略・not_processed）を固定入力で検証する。oracleはDATA fixtureの全header／時刻／集合と固定warning／error順から独立に期待値を作り、helperの戻り値を期待値計算に再使用しない。pre／post停止、throw／未知理由、二重開始・swallowed再入・混入、失効、秘密非出力・固定abort後custodyを確認する。
- compiled実graphの一時copyだけに35種類の故障を入れる。同owner／pending／rows／receipt／budget／serial、expectationのbinding／時刻／header／入力／出力／content_evidence、D1本文／original_rows／manifest／trace／Ppを差し替え、prefix一致・ID一致だけで通らないことを確認する。runtime friendを追加しない。
- 追加の5slot（expectation／parts／本文候補／prefix候補／dest owner）をそれぞれ意図的に保持すると、本文破棄証拠・上位custody移譲を拒否する。FP-1と旧D2のcompiled制御も残す。
- 梱包監査に新しい入口・型・slot・固定継続のmarkerを追加する。runtime輸入／I/O／clock／worker依存を禁止し、compiled fixtureのfetchは拒否stubを維持する。

## 3 実行結果・初回失敗

- 新旧3 files／29 tests成功。新FP-2は9 testsで、同一claimの旧FP-1／D2保証も維持した。
- strict TypeScript実graphのemitとcompiled保証：旧D2・FP-1、FP-2の35故障・5保持slot負の対照が成功。
- compiled初回は余分field追加を`binding`と期待したが、先行するstrict schema検査で`shape`として拒否されて失敗した。検査順を確認し、この1caseの期待分類だけを訂正。拒否条件・実装・製品／テスト期限は変更せず再実行成功。
- `npm run build`成功。対象5ファイルのESLintは問題なし。
- `npm test -- --reporter=json --outputFile=/private/tmp/servicenow-fp2-vitest.json`：ローカル合成待受が可能な条件で282 files／13,719 tests成功、失敗・保留0。製品／テスト期限は変更していない。
- `env npm_config_offline=true npm run test:pack`：外部取得禁止・既存キャッシュのみでproduction-only install／analysis／aggregation成功（441 files）。
- `node tests/review/package-http-classification.mjs`：配布除外／固定依存監査と旧compiled保証・FP-2の故障／保持slot対照が成功（441 files）。
- `git diff --check`問題なし。関連4文書のローカルリンク28件も存在確認した。

コミット前再検証：対象10ファイルだけをstageし、未stage差分・未追跡ファイルがない状態でビルド・全体合成テストを再実行。282 files／13,719 tests成功、失敗・保留0。対象5ファイルのESLint、リンク28件、外部取得禁止の梱包試験とcompiled保証を含む配布除外監査（各441 files）も成功。初回の期待分類誤りは上記のまま保持する。

## 4 残課題・維持する閉鎖状態

次はFP-3のpost-only private proof受理と未公開完成bundle／一度限りの固定消費。その実装・完成bundle・seal成功は今回の範囲外。正式発行口閉鎖・全体受付無効・Unknown・VM／監視／telemetry調査保留を維持し、実接続・実通信・実機操作・設定変更・Pushは行っていない。
